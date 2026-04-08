/**
 * Tiny shared reactive registry for hydrated components (no VDOM).
 *
 * - `__defineState(name, initial?)` — returns `{ get, set, subscribe }` for that signal
 * - `__getState(name)` / `__updateState(name, value)` — read / write without holding the handle
 * - `__computeState(name, depNames[], fn)` — computed signal stored under `name`
 * - `__watchState(depNames[], fn)` — run `fn` when any dep updates
 * - `wireReactiveDom(root)` — `[data-bind="signalName"]` → textContent
 * - `__markHydrated(name, selector)` — called automatically at end of each hydration wrapper
 * - `__whenHydrated(name, selector, fn)` — run `fn` once all instances of `name` have hydrated
 *
 * Safe to load once in components.js and again in inline critical scripts (idempotent).
 * @returns {string} IIFE source to prepend/minify into bundles
 */
export function getReactiveRuntime() {
  return `(function(g){
if(!g.__defineState){
var R=new Map();
function S(){
var v,t=0,z=new Set();
return{
get:function(){return v},
set:function(n){
if(t&&Object.is(v,n))return;
t=1;v=n;
z.forEach(function(f){try{f(n)}catch(e){console.error(e)}})
},
subscribe:function(f){
z.add(f);
try{f(v)}catch(e){console.error(e)}
return function(){z.delete(f)}
},
_tryInit:function(n){if(!t){this.set(n)}}
}
}
g.__defineState=function(n,i){
if(!R.has(n))R.set(n,S());
var s=R.get(n);
if(arguments.length>1)s._tryInit(i);
return s
};
g.__getState=function(n){return g.__defineState(n).get()};
g.__updateState=function(n,v){g.__defineState(n).set(v)};
}
if(!g.__computeState){
g.__computeState=function(name,deps,compute){
if(!deps||!deps.length||typeof compute!=="function")return g.__defineState(name);
function pull(){
var vals=deps.map(function(d){return g.__getState(d);});
g.__updateState(name,compute.apply(null,vals));
}
deps.forEach(function(d){g.__defineState(d).subscribe(function(){pull();});});
pull();
return g.__defineState(name);
};
}
if(!g.__watchState){
g.__watchState=function(deps,fn){
if(!deps||!deps.length||typeof fn!=="function")return;
deps.forEach(function(name){g.__defineState(name).subscribe(function(){fn();});});
};
}
if(!g.wireReactiveDom){
g.wireReactiveDom=function(root){
if(!root||!root.querySelectorAll)return;
root.querySelectorAll("[data-bind]").forEach(function(el){
var n=el.getAttribute("data-bind");
if(!n)return;
g.__defineState(n).subscribe(function(v){
el.textContent=v==null?"":String(v);
});
});
};
}
if(!g.__markHydrated){
var _H=new Map();
g.__markHydrated=function(name,selector){
var k=name+"|"+selector;
if(!_H.has(k))_H.set(k,{done:0,total:0,cbs:[]});
var e=_H.get(k);
if(!e.total){
e.total=document.querySelectorAll(selector).length||1;
}
e.done++;
if(e.done>=e.total){
var fns=e.cbs.splice(0);
fns.forEach(function(f){try{f()}catch(err){console.error(err)}});
}
};
g.__whenHydrated=function(name,selector,fn){
var k=name+"|"+selector;
if(!_H.has(k))_H.set(k,{done:0,total:0,cbs:[]});
var e=_H.get(k);
var total=document.querySelectorAll(selector).length||1;
if(!e.total)e.total=total;
if(e.done>=e.total){
try{fn()}catch(err){console.error(err)}
}else{
e.cbs.push(fn);
}
};
}
})(typeof globalThis!=="undefined"?globalThis:window);`;
}
