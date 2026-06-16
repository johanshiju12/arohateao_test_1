(function(){
var API_KEY = 'AQ.Ab8RN6IN72BkW05knxMXSDEtABkIN0UOifb3b8EioleUhihhsw';
var API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + API_KEY;

var BASE_PROMPT = "You are Kaitiaki AI, a friendly and knowledgeable NCEA study assistant built into the Aroha Te Ao website. Your name means 'guardian' in Te Reo Maori. You help New Zealand secondary school students with their NCEA studies.\n\nKey facts you know:\n- NCEA has 3 levels (Level 1 = Year 11, Level 2 = Year 12, Level 3 = Year 13)\n- Students need 60 credits to get an NCEA certificate at each level\n- Grades are: Not Achieved (NA), Achieved (A), Merit (M), Excellence (E)\n- GPA calculation: NA=0, A=2, M=3, E=4, weighted by credits\n- Standards can be Internal (assessed at school) or External (end-of-year exams)\n- Endorsements: 50+ credits at Merit or above = Merit endorsement\n- University Entrance: NCEA Level 3, 14 credits in 3 approved subjects, UE Literacy and Numeracy\n\nYou are part of the Aroha Te Ao website. Be encouraging, warm, and concise. Use NZ English. Keep responses short and helpful.\n\nYou can reference specific student data when asked. Never share one student's grades with another student without authorisation — but since this is an admin tool, you can freely discuss all student data when asked.";

var SYSTEM_PROMPT = BASE_PROMPT;
var studentDataLoaded = false;

// Load student data from Firestore to give AI context
function loadStudentContext() {
  try {
    var firebaseConfig = {
      apiKey: "AIzaSyCaUabmvdt1UEzxbTRprs1VsvxXju2A_sg",
      authDomain: "aroha-te-ao.firebaseapp.com",
      projectId: "aroha-te-ao",
      storageBucket: "aroha-te-ao.firebasestorage.app",
      messagingSenderId: "222775558795",
      appId: "1:222775558795:web:f8ba238ce96405d35e0a8e"
    };
    if (!window._kaiFirebase) {
      if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      window._kaiFirebase = typeof firebase !== 'undefined' ? firebase.firestore() : null;
    }
    var db = window._kaiFirebase;
    if (!db) return;

    db.collection('app').doc('tracker').get().then(function(doc) {
      if (!doc.exists) return;
      var students = doc.data().students || [];
      if (students.length === 0) return;

      var summary = "\n\nCURRENT STUDENT DATA (from the tracker):\n";
      students.forEach(function(s) {
        var totalCredits = 0, earnedCredits = 0, weightedSum = 0, gradedCredits = 0;
        var grades = {na:0, a:0, m:0, e:0};
        s.subjects.forEach(function(subj) {
          subj.standards.forEach(function(std) {
            totalCredits += std.credits;
            if (std.grade) {
              var pts = {na:0,a:2,m:3,e:4};
              gradedCredits += std.credits;
              weightedSum += (pts[std.grade]||0) * std.credits;
              grades[std.grade]++;
              if (std.grade !== 'na') earnedCredits += std.credits;
            }
          });
        });
        var gpa = gradedCredits > 0 ? (weightedSum / gradedCredits).toFixed(2) : 'N/A';
        summary += "\n- " + s.name + ": GPA " + gpa + ", " + earnedCredits + "/" + totalCredits + " credits earned, " + s.subjects.length + " subjects";
        summary += " (E:" + grades.e + " M:" + grades.m + " A:" + grades.a + " NA:" + grades.na + ")";
        summary += "\n  Subjects: " + s.subjects.map(function(sub){ return sub.name; }).join(', ');
      });

      SYSTEM_PROMPT = BASE_PROMPT + summary;
      studentDataLoaded = true;
    }).catch(function(e) { console.warn('Kaitiaki: could not load student data', e); });
  } catch(e) {}
}

// Try loading after a short delay to let Firebase SDK load
setTimeout(loadStudentContext, 1500);

var conversationHistory = [];
var isOpen = false;

// Inject CSS
var style = document.createElement('style');
style.textContent = `
.kai-btn { position:fixed; bottom:24px; right:24px; width:56px; height:56px; border-radius:50%; background:#1a3f6b; color:#fff; border:none; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.2); z-index:9998; display:flex; align-items:center; justify-content:center; font-size:24px; transition:transform 0.2s,background 0.2s; }
.kai-btn:hover { transform:scale(1.08); background:#0a1e3d; }
.kai-btn .badge { position:absolute; top:-2px; right:-2px; width:18px; height:18px; background:#c8a94e; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:#0a1e3d; }
.kai-popup { position:fixed; bottom:92px; right:24px; width:380px; height:520px; background:#edf2f8; border-radius:16px; box-shadow:0 12px 48px rgba(0,0,0,0.18); z-index:9999; display:none; flex-direction:column; overflow:hidden; border:1px solid #d0d8e4; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; }
.kai-popup.open { display:flex; }
.kai-head { background:#0a1e3d; padding:16px 20px; display:flex; align-items:center; gap:10px; }
.kai-head .kai-av { width:32px; height:32px; background:#1a3f6b; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#c8a94e; font-weight:700; font-size:14px; }
.kai-head .kai-info { flex:1; }
.kai-head .kai-info h3 { color:#fff; font-size:14px; font-weight:700; margin:0; }
.kai-head .kai-info span { color:rgba(255,255,255,0.5); font-size:11px; }
.kai-head .kai-close { background:none; border:none; color:rgba(255,255,255,0.5); font-size:20px; cursor:pointer; padding:4px; }
.kai-head .kai-close:hover { color:#fff; }
.kai-msgs { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
.kai-msg { max-width:82%; animation:kaiFade 0.2s ease; }
.kai-msg.ai { align-self:flex-start; }
.kai-msg.user { align-self:flex-end; }
.kai-msg .bub { padding:10px 14px; border-radius:14px; font-size:13px; line-height:1.5; }
.kai-msg.ai .bub { background:#fff; border:1px solid #d0d8e4; border-top-left-radius:4px; color:#1a1e2a; }
.kai-msg.user .bub { background:#1a3f6b; color:#fff; border-top-right-radius:4px; }
.kai-msg.ai .bub strong { color:#0a1e3d; }
.kai-msg.ai .bub ul { margin:4px 0; padding-left:16px; }
.kai-msg.ai .bub li { margin-bottom:3px; }
.kai-msg.ai .bub p { margin-bottom:6px; }
.kai-msg.ai .bub p:last-child { margin-bottom:0; }
.kai-typing { display:flex; gap:4px; padding:10px 14px; }
.kai-typing span { width:6px; height:6px; background:#7a766e; border-radius:50%; opacity:0.4; animation:kaiBlink 1.4s infinite; }
.kai-typing span:nth-child(2) { animation-delay:0.2s; }
.kai-typing span:nth-child(3) { animation-delay:0.4s; }
.kai-input { padding:12px 16px; border-top:1px solid #d0d8e4; display:flex; gap:8px; background:#fff; }
.kai-input input { flex:1; padding:10px 14px; border:1px solid #d0d8e4; border-radius:20px; font-size:13px; outline:none; font-family:inherit; }
.kai-input input:focus { border-color:#1a3f6b; }
.kai-input button { width:36px; height:36px; border-radius:50%; background:#1a3f6b; color:#fff; border:none; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; }
.kai-input button:disabled { background:#d0d8e4; }
@keyframes kaiFade { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
@keyframes kaiBlink { 0%,60%,100%{opacity:0.4} 30%{opacity:1} }
@media (max-width:500px) { .kai-popup { right:8px; left:8px; bottom:80px; width:auto; height:70vh; } .kai-btn { bottom:16px; right:16px; } }
`;
document.head.appendChild(style);

// Inject HTML
var widget = document.createElement('div');
widget.innerHTML = `
<button class="kai-btn" id="kaiBtnToggle" title="Chat with Kaitiaki AI">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
</button>
<div class="kai-popup" id="kaiPopup">
  <div class="kai-head">
    <div class="kai-av">K</div>
    <div class="kai-info"><h3>Kaitiaki AI</h3><span>NCEA Study Assistant</span></div>
    <button class="kai-close" id="kaiClose">&times;</button>
  </div>
  <div class="kai-msgs" id="kaiMsgs">
    <div class="kai-msg ai"><div class="bub"><p>Kia ora! I'm <strong>Kaitiaki</strong>, your NCEA study assistant. Ask me about standards, grades, study tips, or anything school-related.</p></div></div>
  </div>
  <div class="kai-input">
    <input type="text" id="kaiInput" placeholder="Ask anything..." autocomplete="off">
    <button id="kaiSend">&#8593;</button>
  </div>
</div>`;
document.body.appendChild(widget);

// Logic
var btn = document.getElementById('kaiBtnToggle');
var popup = document.getElementById('kaiPopup');
var closeBtn = document.getElementById('kaiClose');
var msgs = document.getElementById('kaiMsgs');
var input = document.getElementById('kaiInput');
var sendBtn = document.getElementById('kaiSend');

btn.addEventListener('click', function(){ popup.classList.toggle('open'); if(popup.classList.contains('open')) input.focus(); });
closeBtn.addEventListener('click', function(){ popup.classList.remove('open'); });

function escHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function formatAI(text){
  var h = text;
  h = h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  h = h.replace(/\n- /g,'</p><ul><li>');
  h = h.replace(/\n\n/g,'</p><p>');
  h = '<p>'+h+'</p>';
  h = h.replace(/<ul><li>/g,'<ul><li>');
  h = h.replace(/<li>([^<]+)/g,'<li>$1</li>');
  if(h.indexOf('<ul>')!==-1 && h.indexOf('</ul>')===-1) h+='</ul>';
  h = h.replace(/<p><\/p>/g,'');
  return h;
}

function addMsg(role, content){
  var d=document.createElement('div');
  d.className='kai-msg '+role;
  d.innerHTML='<div class="bub">'+(role==='ai'?formatAI(content):escHtml(content))+'</div>';
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}

function showTyping(){
  var d=document.createElement('div');d.className='kai-msg ai';d.id='kaiTyping';
  d.innerHTML='<div class="bub"><div class="kai-typing"><span></span><span></span><span></span></div></div>';
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;
}
function hideTyping(){ var el=document.getElementById('kaiTyping'); if(el)el.remove(); }

async function send(){
  var text=input.value.trim();
  if(!text)return;
  input.value='';
  sendBtn.disabled=true;
  addMsg('user',text);
  conversationHistory.push({role:'user',parts:[{text:text}]});
  showTyping();
  try{
    var resp=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM_PROMPT}]},contents:conversationHistory})});
    var data=await resp.json();
    hideTyping();
    if(data.candidates&&data.candidates[0]&&data.candidates[0].content){
      var aiText=data.candidates[0].content.parts[0].text;
      conversationHistory.push({role:'model',parts:[{text:aiText}]});
      addMsg('ai',aiText);
    } else if(data.error){
      addMsg('ai','Sorry, error: '+(data.error.message||'Unknown'));
    } else {
      addMsg('ai','Sorry, I could not respond. Try again.');
    }
  }catch(err){
    hideTyping();
    addMsg('ai','Could not connect. Make sure you are online.');
  }
  sendBtn.disabled=false;
  input.focus();
}

sendBtn.addEventListener('click',send);
input.addEventListener('keydown',function(e){if(e.key==='Enter')send();});
})();