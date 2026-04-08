# ooooooo

ooooooo is a single-file-component JS framework that outputs dynamic static websites.

Easily define, modify, and subscribe to any components state for rich reactivity.

All component scripts are wrapped with individual hydration strategies, then bundled together and minified.

All component styles are bundled and minified with the option for critical path inline on a per page basis.

Components are defined in `.component` files and scoped to prevent leaks so you don't need to scope your own styles.

### Button Counter Example: demo-counter.component
```html
<button class="btn">
  Count: <span class="value" data-bind="demo-counter">0</span>
</button>

<style>
  .btn {
    background: transparent;
    border: 3px solid var(--text-color, #f0f0f0);
    color: var(--text-color, #f0f0f0);
    padding: 8px 14px;
  }
</style>

<script hydrate="load">
  const btn = root.querySelector(".btn");

  __defineState("demo-counter", 0);

  btn.addEventListener("click", () => {
    __updateState("demo-counter", __getState("demo-counter") + 1);
  });
</script>
```

then all you need to do to use the component is define it inside of a `.html` file. 
```html
<div component="demo-counter"></div>
```

The styles, script are moved to the right locations automatically at build time, and the `component` attributed div is replaced so markup is very clean and minimal.


Let's create a subscriber component:

```html
<div class="swatch"></div>

<style>
  .swatch {
    width: 100px;
    height: 100px;
    background: #444;
  }
</style>

<script hydrate="load">
  const swatch = root.querySelector(".swatch");

  const randomColor = (seed = 0) => {
    return `hsl(${((Number(seed) || 0) * 37) % 360} 65% 50%)`;
  };

  __watchState(["demo-counter"], () => {
    swatch.style.background = randomColor(__getState("demo-counter"));
  });
</script>
```

This component simply displays a 100x100 square with a color in it seeded by whatever number the counter button component is clicked to. It uses a built in `__watchState()` magic function to watch the state of the other components. Multiple components can subscribe to any one component's state.

```html
<div component="demo-counter"></div>
<div component="demo-swatch"></div>
```

you can pass detailed arguments into a component using the `props=` attribute, including objects. You can grab external .js file data from the magic function `__data("path-to-file")`. ooooooo supports logical html templating. Here is an example of grabbing a file at build, populating an object, looping through it to populate our card component.

```html
<script>
  const articles = __data("_data/articles.js", "articles");
</script>

<div class="container">
  {each articles as article}
    <div class="col">
      <div component="card" props="article"></div>
    </div>
  {/each}
</div>
```

### Dynamic hydration

for when the components JS runs:

- **`subscribe:component`** — the script runs after another component is hydrated.
- **`load`** — the script runs on `DOMContentLoaded`. Default option if hydrate attribute is omitted.
- **`now`** — the script runs immediately in an IIFE.
- **`visible`** — the script runs when the component enters the viewport; optional (**1–100**), e.g. `visible:50`.
- **`time`** — the script runs after a set delay (default **0ms**). Example: `time:3000` waits 3 seconds.
- **`wait`** — the script runs when the main thread is free. `requestIdleCallback`
- **`interact`** — the script runs once on a user interaction. Optional selector and event, e.g. `interact:.btn:click`, `interact:hover` (hover = `pointerenter`). Default event is `pointerdown` if omitted.
  - **`interact:.selector:event`** — listen on elements **inside this component’s** scoped root only (short form, avoids matching the same class elsewhere on the page).
  - **`interact:global:.selector:event`** — listen on **`document`** (use when the target lives **outside** this component, e.g. another component’s region).


```html
<div class="hydration-demo">
  <span class="wave-text">My JS doesn't run until I enter the viewport!</span>
  <span class="hydration-time"></span>
</div>

<script hydrate="visible">
  const output = root.querySelector(".hydration-time");
  output.textContent = "Hydrated at: " + new Date().toLocaleTimeString();
</script>
```

### Reactivity API
magic functions inside components/pages

- `__defineState("name", initial?)` — create or touch a named signal; optional initial value
- `__getState("name")` — read current value
- `__updateState("name", value)` — write and notify subscribers
- `__watchState(["name1", "name2", ...], () => { ... })` — run the callback when any listed signal changes
- `__computeState("name", ["dep1", ...], (depValues...) => derived)` — derived signal from dependencies
- Elements with `data-bind="name"` stay in sync with that signal when the runtime wires the page (same name as `__defineState`)


### Page Level

Define variables at the top of .html files inside a `<script>` to prepopulate component props or meta fields in template files. Top-level scripts in .html files act like macros and are preprocessed before the templating step during the build. This lets you prepare any data you need at the application level before rendering. Variables defined in .html files can then be populated at the template level, which is useful for things like SEO metadata, schema implementation, etc.

```html
<script>
  const title = "Page Title";                     // Swap [title] in template
  const description = "My page Meta Description"; // Swap [description] in template
  const template = "article";                     // Use _templates/article.template (stem only)
  const whatever = "derp";                        // replace the [whatever] template variable, or for use on page.
  const myData = __data("my-file", "variable");   // Grab external data for templating
</script>
```

Besides `title` / `description` / `template`, you can set **`mount`** (which `[…]` slot in the template receives the page body; default `content`) and any other keys you reference as `[name]` in the template.

you can also include scripts/stylesheets at build time with asset delivery options.

```js
  __injectStyle("static/css/custom-styles.css", "preload");
  __injectStyle("static/css/print.css", "media");
  __injectScript("https://example.com/script.js", "defer");
```

ooooooo does not copy over content within _ prefixed directories, making it an ideal place to organize components/templates/data. Project Structure:

```
src/
├── _components/    reusable components
├── _data/          external data sources (optional)
├── _templates/     reusable page templates
├── static          project assets (css/js/images)
├── about/
│   └── index.html  directory-based route: /about
└── index.html      home page: /
ooo.config.js       ooooooo settings
```
### Critical CSS / JS

- In a **`.component` file**, non-critical `<style>` goes into the bundle; use **`<style critical>`** (or the parser’s critical flag) to inline that CSS for faster first paint where supported.
- In a **page `.html`**, `<style critical>` and non-module critical scripts can be inlined; non-critical `<style>` and `<script type="module">` are extracted to hashed files unless configured otherwise.

### installation
`npm install github:dmac780/ooooooo`

`npm ooo init` (scaffold new project)

`npm run build` (or `npx ooo build`)

then serve with whatever.

### Configuration (`ooo.config.js`)

Optional file at the **project root** (next to `package.json`). Export a default object; **only include keys you want to override.** Anything omitted keeps the engine default.

| Key | Role |
|-----|------|
| `src` | Source folder (default `src`) |
| `out` | Build output folder (default `dist`) |
| `componentDir` | Components directory name inside `src` (default `_components`) |
| `templateDir` | Templates directory name inside `src` (default `_templates`) |
| `cssFile` | Bundled stylesheet filename (default `styles.css`) |
| `jsFile` | Bundled script filename (default `components.js`) |
| `cssPath` | Subfolder under `out` for CSS files; empty string = `out` root |
| `jsPath` | Subfolder under `out` for JS files; empty string = `out` root |

`ooo init` drops a starter `ooo.config.js` if one is not already there.

### Wiring components together

Components do not send messages through a parent tree. They coordinate through **shared state names**: `__defineState("my-key", …)`, `__updateState`, `__getState`, and `__watchState(["my-key", …], …)`. Any hydrated script can use the same string key; hydration options like `subscribe:other-component` only control **order of execution**, not data flow.


