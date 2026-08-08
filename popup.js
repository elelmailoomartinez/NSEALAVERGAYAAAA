// popup.js
const STATES = [
  "Todos","Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","México","Estado de México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas","CDMX","Ciudad de México"
];

function populate(){
  const sel = document.getElementById('stateSelect');
  STATES.forEach(s=>{
    const opt = document.createElement('option'); opt.value = s; opt.innerText = s; sel.appendChild(opt);
  });
  chrome.storage.local.get(['selectedState','debugMode'], res=>{
    const st = res.selectedState || 'Todos';
    const dbg = !!res.debugMode;
    sel.value = st;
    document.getElementById('debugMode').checked = dbg;
  });
}

function save(){
  const sel = document.getElementById('stateSelect');
  const v = sel.value || 'Todos';
  const dbg = document.getElementById('debugMode').checked;
  chrome.storage.local.set({selectedState: v, debugMode: dbg}, ()=>{
    chrome.tabs.query({}, tabs=>{
      tabs.forEach(t=>{ try{ chrome.tabs.sendMessage(t.id, {type:'selectedStateChanged', value:v}); }catch(e){} });
    });
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  populate();
  document.getElementById('saveBtn').addEventListener('click', save);
});
