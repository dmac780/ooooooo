import vm from "vm";
import { 
  YELLOW,
  RESET
} from "./utils.js";

/**
 * @param {string} s - The template string
 * @param {number} start - The starting index of the `{each ...}` tag
 * @returns {{ listExpr: string, alias: string, headerEnd: number } | null}
 * @description Returns the list expression, alias, and the index of the closing `}` of the `{each ...}` tag.
 */
export function parseEachHeader(s, start) {
  
  /** @type {string} */
  const openEach = "{each ";

  /** @type {number} */
  const openEachLength = openEach.length;

  /** @type {string} */
  const asKeyword = " as ";

  /** @type {number} */
  const asKeywordLength = asKeyword.length;

  /** @type {string} */
  const closeBracket = "}";


  if (s.slice(start, start + openEachLength) !== openEach) {
    return null;
  }

  const asIdx = s.indexOf(asKeyword, start);
  if (asIdx === -1) {
    return null;
  }

  const closeIdx = s.indexOf(closeBracket, asIdx);
  if (closeIdx === -1) {
    return null;
  }

  /** @type {RegExp} */
  const identifierRE = /^\w+$/;

  /** @type {string} */
  const listExpr = s.slice(start + openEachLength, asIdx).trim();

  /** @type {string} */
  const alias = s.slice(asIdx + asKeywordLength, closeIdx).trim();

  if (!identifierRE.test(alias)) {
    return null;
  }

  return { listExpr, alias, headerEnd: closeIdx + 1 };
}


/**
 * @param {string} s - The template string
 * @returns {{ start: number, end: number, listExpr: string, alias: string, body: string } | null}
 * @description Returns the first `{each ...} ... {/each}` block in the template string.
 */
export function findFirstEachBlock(s) {

  /** @type {string} */
  const openEach = "{each ";

  /** @type {string} */
  const closeEach = "{/each}";

  /** @type {number} */
  const closeEachLength = closeEach.length;

  /** @type {number} */
  const openEachLength = openEach.length;

  /** @type {number} */
  const start = s.indexOf(openEach);

  if (start === -1) {
    return null;
  }

  /** @type {{ listExpr: string, alias: string, headerEnd: number } | null} */
  const header = parseEachHeader(s, start);

  if (!header) {
    return null;
  }

  /** @type {number} */
  let i = header.headerEnd;

  /** @type {number} */
  let depth = 1;

  /** @type {number} */
  const bodyStart = i;

  while (i < s.length && depth > 0) {

    /** @type {number} */
    const nextEach  = s.indexOf(openEach, i);

    /** @type {number} */
    const nextClose = s.indexOf(closeEach, i);

    if (nextClose === -1) {
      console.warn(`${YELLOW}  Warning: unclosed {each} block${RESET}`);
      return null;
    }

    if (nextEach !== -1 && nextEach < nextClose) {
      depth++;
      i = nextEach + openEachLength;
    } else {
      depth--;
      if (depth === 0) {

        /** @type {string} */
        const body = s.slice(bodyStart, nextClose);

        return {
          start,
          end: nextClose + closeEachLength,
          listExpr: header.listExpr,
          alias: header.alias,
          body
        };
      }
      i = nextClose + 7;
    }
  }
  return null;
}


/**
 * @param {string} template - The template string
 * @param {object} props - The props object
 * @returns {string} - The rendered template string
 * @description Renders the template string with the given props.
 * Templating for components/pages
 * @example
 *   {variable}
 *   {props.variable}
 *   {props.nested.key}
 *   {each listExpr as alias} ... {/each}
 *   {if condition} ... {/if}
 *   {if condition} ... {else} ... {/else}
 */
export function renderTemplate(template, props = {}) {

  if (typeof template !== "string") {
    return "";
  }

  /** @type {object} */
  const data = (props && typeof props === "object") ? props : {};

  /** @type {string} */
  let result = template;

  // Each loops before if/variables so inner markup sees the loop binding.
  for (let guard = 0; guard < 10000; guard++) {

    /** @type {{ start: number, end: number, listExpr: string, alias: string, body: string } | null} */
    const block = findFirstEachBlock(result);

    if (!block) {
      break;
    }

    /** @type {unknown} */
    let list;

    try {

      /** @type {vm.Context} - the context for the vm */
      const context = vm.createContext({ props: data, ...data });

      list = vm.runInContext(block.listExpr, context, { timeout: 100 });

    } catch (_e) {
      console.warn(`${YELLOW}  Warning: each expression error: ${block.listExpr}${RESET}`);
      list = [];
    }

    if (!Array.isArray(list)) {
      list = [];
    }

    /** @type {RegExp} */
    const aliasRe = new RegExp(
      `props=(["'])${block.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`,
      "g"
    );

    /** @type {string} */
    const expanded = list
      .map((item) => {

        /** @type {object} */
        const scope = { ...data, [block.alias]: item, props: item };

        /** @type {string} */
        let chunk = renderTemplate(block.body, scope);

        // Use single quotes for JSON attribute value to avoid conflicts with JSON's double quotes
        // Escape braces so later renderTemplate passes don't treat them as variables

        /** @type {string} */
        const json = JSON.stringify(item).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");

        /** @type {string} */
        chunk = chunk.replace(aliasRe, () => `props='${json}'`);

        return chunk;
      })
      .join("");

    /** @type {string} */
    result = result.slice(0, block.start) + expanded + result.slice(block.end);
  }

  // Resolve conditionals with proper nesting support (innermost first)
  for (let guard = 0; guard < 10000; guard++) {
    
    /** @type {boolean} */
    let foundAny = false;
    
    // Find innermost {if} block (one without nested {if} inside)
    /** @type {number[]} */  
    const ifMatches = [];

    /** @type {number} */
    let searchPos = 0;

    while (true) {

      /** @type {number} */
      const ifPos = result.indexOf("{if ", searchPos);
      if (ifPos === -1) {
        break;
      }

      ifMatches.push(ifPos);
      searchPos = ifPos + 1;
    }
    
    if (ifMatches.length === 0) break;
    
    // Check each {if} to find one without nested {if} in its body
    for (const ifStart of ifMatches) {

      /** @type {number} */
      const condEnd = result.indexOf("}", ifStart);
      if (condEnd === -1) {
        continue;
      }

      /** @type {string} */
      const condition = result.slice(ifStart + 4, condEnd).trim();

      // Find the block terminator ({/if} or {/else} depending on format)
      /** @type {number} */
      let endIfMatch = result.indexOf("{/if}", condEnd + 1);

      /** @type {number} */
      const elseMatch = result.indexOf("{else}", condEnd + 1);

      /** @type {number} */
      const elseEndMatch = result.indexOf("{/else}", condEnd + 1);
      
      // If we have {else}...{/else} format, the block ends at {/else} not {/if}
      /** @type {number} */
      let blockEnd;
      if (elseEndMatch !== -1 && (endIfMatch === -1 || elseEndMatch < endIfMatch)) {
        blockEnd = elseEndMatch + 7;
      } else if (endIfMatch !== -1) {
        blockEnd = endIfMatch + 5;
      } else {
        continue;
      }
      
      // For nesting check, look for {if between condition end and block end
      /** @type {number} */
      const nestedIf = result.indexOf("{if ", condEnd + 1);
      if (nestedIf !== -1 && nestedIf < blockEnd - 7) {
        continue;
      }
      
      // This is an innermost block, process it
      /** @type {string} */
      let truthyContent = "";

      /** @type {string} */
      let falsyContent = "";
      
      if (elseMatch !== -1 && elseMatch < blockEnd) {
        truthyContent = result.slice(condEnd + 1, elseMatch);
        
        if (elseEndMatch !== -1 && elseEndMatch === blockEnd - 7) {
          // {if} ... {else} ... {/else}
          falsyContent = result.slice(elseMatch + 6, elseEndMatch);
        } else if (endIfMatch !== -1 && endIfMatch === blockEnd - 5) {
          // {if} ... {else} ... {/if} (legacy format)
          falsyContent = result.slice(elseMatch + 6, endIfMatch);
        }
      } else {
        // {if} ... {/if} (no else)
        if (endIfMatch !== -1) {
          truthyContent = result.slice(condEnd + 1, endIfMatch);
        } else {
          truthyContent = result.slice(condEnd + 1, blockEnd);
        }
      }
      
      try {
        /** @type {vm.Context} */
        const context = vm.createContext({ props: data, ...data });

        /** @type {boolean} */
        const shouldShow = vm.runInContext(`!!(${condition})`, context, { timeout: 100 });

        result = result.slice(0, ifStart) + (shouldShow ? truthyContent : falsyContent) + result.slice(blockEnd);
        foundAny = true;
        break;
      } catch (_e) {
        console.warn(`${YELLOW}  Warning: template condition error: ${condition}${RESET}`);
        result = result.slice(0, ifStart) + result.slice(blockEnd);
        foundAny = true;
        break;
      }
    }
    
    if (!foundAny) break;
  }

  /** @type {RegExp} */
  const templateRE = /\{(props\.)?([^}]+)\}/g;

  // Replace plain variables and keep template control tags intact.
  result = result.replace(templateRE, (_m, _prefix, key) => {
    const token = key.trim();
    if (
      token.startsWith("if ") ||
      token.startsWith("each ") ||
      token === "else" ||
      token.startsWith("/")
    ) {
      return `{${_prefix ? "props." : ""}${key}}`;
    }

    /** @type {unknown} - the value of the variable from the props object */
    let value = data;

    /** @type {string[]} */
    const parts = token.split(".");
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = value[part];
      } else {
        return "";
      }
    }
    return (value === null || value === undefined) ? "" : String(value);
  });

  return result.trim();
}