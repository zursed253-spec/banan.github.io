'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(stored={}) {
  class Element {
    constructor(tag='div') {
      this.tagName = tag; this.children=[];this.dataset={};this.attrs={};this.listeners={};
      this.style={};this.hidden=false;this.disabled=false;this.className='';this.innerHTML='';
      this.textContent='';this.type='';this.focused=false;
    }
    appendChild(child){this.children.push(child);return child;}
    replaceChildren(...children){this.children=children;}
    addEventListener(name,callback){(this.listeners[name]??=[]).push(callback);}
    dispatch(name, e={}){for(const fn of this.listeners[name]||[])fn({stopPropagation(){},preventDefault(){},target:this,pointerId:1,button:0,clientX:150,clientY:150,...e});}
    click(){this.dispatch('click');}
    contains(target){return target===this||this.children.some(child=>child.contains?.(target));}
    setAttribute(key,value){this.attrs[key]=String(value);}
    getAttribute(key){return this.attrs[key];}
    querySelectorAll(sel){return sel==='button'?this.children.filter(c=>c.tagName==='button'):[];}
    focus(){this.focused=true;}
    setPointerCapture(){}
    get classList(){return {add:c=>this.className+=' '+c,remove:c=>this.className=this.className.replace(c,'').trim()};}
  }
  const ids=['decorToggle','decorClose','decorPanel','poopLayer','poopChoices','poopCounter','poopClear'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  elements.decorPanel.hidden=true;
  const light=new Element('button');light.dataset.siteTheme='light';
  const dark=new Element('button');dark.dataset.siteTheme='dark';
  const meta=new Element('meta');
  const root=new Element('html');root.dataset.theme='light';
  const store=new Map(Object.entries(stored));
  const document={
    documentElement:root,
    getElementById:id=>elements[id]||null,
    createElement:tag=>new Element(tag),
    querySelector:sel=>sel==='meta[name="theme-color"]'?meta:null,
    querySelectorAll:sel=>sel==='[data-site-theme]'?[light,dark]:[],
    addEventListener(){}
  };
  const localStorage={
    getItem:key=>store.get(key)??null,
    setItem:(key,val)=>store.set(key,val)
  };
  const window={innerWidth:390,innerHeight:800};
  const context={document,window,localStorage,JSON,Math,Date};
  vm.runInNewContext(fs.readFileSync(require.resolve('../site-personalize.js'),'utf8'),context);
  return {elements,light,dark,meta,root,store};
}

test('theme starts light, changes to dark and persists correctly',()=>{
  const x=setup();
  assert.equal(x.root.dataset.theme,'light');
  x.dark.click();
  assert.equal(x.root.dataset.theme,'dark');
  assert.equal(x.store.get('banan-theme'),'dark');
  assert.equal(x.dark.attrs['aria-pressed'],'true');
  assert.equal(x.light.attrs['aria-pressed'],'false');
  assert.equal(x.meta.attrs.content,'#111a21');
  x.light.click();
  assert.equal(x.root.dataset.theme,'light');
});
test('stored theme and sticker choices restore on load',()=>{
  const saved=JSON.stringify([{id:'a',kind:'sleepy',x:.2,y:.4}]);
  const x=setup({'banan-theme':'dark','banan-stickers':saved});
  assert.equal(x.root.dataset.theme,'dark');
  assert.equal(x.elements.poopLayer.children.length,1);
  assert.equal(x.elements.poopCounter.textContent,'1 / 3');
  assert.equal(x.elements.poopChoices.children.length,3);
  assert.ok(x.elements.poopLayer.children[0].innerHTML.includes('viewBox'));
});
test('three decorations are available, placement is capped and removable',()=>{
  const x=setup();
  const options=x.elements.poopChoices.children;
  assert.equal(options.length,3);
  options[0].click();options[1].click();options[2].click();
  assert.equal(x.elements.poopLayer.children.length,3);
  assert.ok(options.every(b=>b.disabled));
  assert.equal(x.elements.poopCounter.textContent,'3 / 3');
  const first=x.elements.poopLayer.children[0];
  first.dispatch('pointerdown',{target:first,clientX:150,clientY:150,pointerId:7});
  first.dispatch('pointermove',{target:first,clientX:210,clientY:250,pointerId:7});
  first.dispatch('pointerup',{target:first,clientX:210,clientY:250,pointerId:7});
  const saved=JSON.parse(x.store.get('banan-stickers'));
  assert.ok(saved[0].x > .38 && saved[0].y > .4,'drag updates normalized coordinates');
  first.children.at(-1).click();
  assert.equal(x.elements.poopLayer.children.length,2);
  x.elements.poopClear.click();
  assert.equal(x.elements.poopLayer.children.length,0);
  assert.deepEqual(JSON.parse(x.store.get('banan-stickers')),[]);
});
test('corrupt saved settings cannot prevent boot',()=>{
  const x=setup({'banan-stickers':'not json','banan-theme':'unexpected'});
  assert.equal(x.root.dataset.theme,'light');
  assert.equal(x.elements.poopLayer.children.length,0);
});
