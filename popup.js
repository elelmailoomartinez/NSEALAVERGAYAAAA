// popup.js
const STATES = [
  "Todos","Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","México","Estado de México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas","CDMX","Ciudad de México"
];

function normalize(s){return s? s.trim(): ''}

function populate(){
  const sel = document.getElementById('stateSelect');
  STATES.forEach(s=>{
    const opt = document.createElement('option'); opt.value = s; opt.innerText = s; sel.appendChild(opt);
  });
  chrome.storage.local.get(['selectedState'], res=>{
    const st = res.selectedState || 'Todos';
    sel.value = st;
  });
}

function save(){
  const sel = document.getElementById('stateSelect');
  const v = sel.value || 'Todos';
  chrome.storage.local.set({selectedState: v}, ()=>{
    // notify all tabs to re-scan
    chrome.tabs.query({}, tabs=>{
      tabs.forEach(t=>{
        try{ chrome.tabs.sendMessage(t.id, {type:'selectedStateChanged', value:v}); }catch(e){}
      });
    });
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  populate();
  document.getElementById('saveBtn').addEventListener('click', save);
});
