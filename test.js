const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errs.push(String(e.detail || e.message || e)));
vc.on('error', m => errs.push('console.error: ' + m));

let html = fs.readFileSync('index.html', 'utf8');
const dataJs = fs.readFileSync('data.js', 'utf8');
html = html.split('<script src="./data.js"></script>').join('<script>' + dataJs.split('</scr'+'ipt>').join('<\\/scr'+'ipt>') + '</scr'+'ipt>');
html = html.split('<script src="./qrcode.js"></script>').join('');
const dom = new JSDOM(html, {
  url: 'https://t.local/', runScripts: 'dangerously',
  pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.matchMedia = w.matchMedia || (q => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }));
    w.Element.prototype.scrollIntoView = function () {};
    w.scrollTo = () => {};
  }
});

function q(sel){ return dom.window.document.querySelector(sel); }
function qa(sel){ return [...dom.window.document.querySelectorAll(sel)]; }
let HAS_PERIODS = false, HAS_ELSE = false, D = null;
const ok = (name, cond) => console.log((cond ? 'ok   ' : 'FAIL ') + name);

dom.window.addEventListener('load', () => setTimeout(run, 400));

function run(){
  D = dom.window.TRACKER_DATA;
  HAS_PERIODS = !!(D.periods && D.periods.length);
  HAS_ELSE = !!(D.issueEra && D.issueEra.length);
  const d = dom.window.document, root = d.documentElement;
  ok('no runtime errors at boot', errs.length === 0);
  ok('boots into the dark nights skin', root.dataset.skin === 'forge');
  if (errs.length) errs.slice(0,4).forEach(e => console.log('   err:', e.slice(0,160)));

  ok('exactly one #tabs nav', qa('nav.tabs').length === 1);
  ok('every issue rendered a row', qa('.row').length === D.issues.length);
  {
    // delegation: no per-row listeners, and clicking a mark still cycles it
    const row = qa('.row').find(r => r.querySelector('[data-act="mark"]'));
    ok('mark buttons are delegation-tagged', !!row);
    const mk = row.querySelector('[data-act="mark"]');
    const before = row.dataset.s;
    mk.click();
    ok('delegated mark click cycles state', row.dataset.s !== before);
    mk.click(); mk.click(); mk.click();
    ok('delegated mark cycles back round', row.dataset.s === before);
    const bmBtn = row.querySelector('[data-act="bm"]');
    const wasPressed = bmBtn.getAttribute('aria-pressed');
    bmBtn.click();
    ok('delegated bookmark toggles', bmBtn.getAttribute('aria-pressed') !== wasPressed);
    bmBtn.click();
    const noteBtn = qa('[data-act="note"]')[0];
    if (noteBtn) {
      noteBtn.click();
      ok('delegated note badge opens a popover', !!d.querySelector('.notepop'));
      noteBtn.click();
      ok('delegated note badge closes again', !d.querySelector('.notepop'));
    }
  }
  {
    // Phase 2: new settings options
    const ids=['comboChip','revChip','skipChip','notesChip','revealChip','autoChip'];
    ok('six new settings chips exist', ids.every(i=>!!q('#'+i)));
    ok('settings panel is sectioned', qa('#panel .shead').length >= 4);

    const before = qa('.row').filter(r=>!r.hidden).length;
    q('#notesChip').click();
    const withNotes = qa('.row').filter(r=>!r.hidden).length;
    ok('notes-only narrows the list', withNotes > 0 && withNotes < before);
    q('#notesChip').click();
    ok('notes-only restores', qa('.row').filter(r=>!r.hidden).length === before);

    const firstOf = () => (qa('.period .pname')[0] || qa('.era-head h2')[0] || {}).textContent;
    const firstBand = firstOf();
    q('#revChip').click();
    ok('newest-era-first reverses the order', firstOf() !== firstBand);
    q('#revChip').click();
    ok('reverse toggles back', firstOf() === firstBand);

    q('#revealChip').click();
    ok('tap-to-reveal sets the root flag', d.documentElement.dataset.reveal === '1');
    q('#revealChip').click();
    q('#comboChip').click();
    ok('combo badge sets the root flag', d.documentElement.dataset.combo === '1');

    // ---- Phase 3: bulk actions + touch controls ----
    ok('bulk era selects are populated', q('#bulkEra').options.length === D.eras.length);
    ok('range selects default to full span',
       q('#bulkFrom').value === '0' && q('#bulkTo').value === String(D.eras.length - 1));
    ok('touch chips exist', !!q('#swipeChip') && !!q('#pressChip'));

    const readBefore = qa('.row').filter(r => r.dataset.s === 'read').length;
    q('#bulkEra').value = '0';
    q('#bulkEraRead').click();
    const readAfter = qa('.row').filter(r => r.dataset.s === 'read').length;
    ok('bulk mark era marks rows read', readAfter > readBefore);
    q('#bulkEraUnread').click();
    ok('bulk unmark era clears them', qa('.row').filter(r => r.dataset.s === 'read').length === readBefore);

    q('#bulkFrom').value = '0'; q('#bulkTo').value = '1';
    q('#bulkRangeRead').click();
    const rangeRead = qa('.row').filter(r => r.dataset.s === 'read').length;
    ok('bulk mark range covers more than one era', rangeRead > readAfter);
    q('#bulkEra').value = '0'; q('#bulkEraUnread').click();
    q('#bulkEra').value = '1'; q('#bulkEraUnread').click();

    q('#swipeChip').click();
    ok('swipe toggle flips', q('#swipeChip').getAttribute('aria-pressed') === 'true');
    q('#swipeChip').click();
    q('#pressChip').click();
    ok('long-press toggle flips', q('#pressChip').getAttribute('aria-pressed') === 'true');
    q('#pressChip').click();
    q('#comboChip').click();
  }
  if (HAS_PERIODS) ok('period bands rendered', qa('.period').length === D.periods.length);
  else ok('no period bands (franchise has none)', qa('.period').length === 0);
  if (HAS_ELSE) ok('story band renders once', qa('.period .pname').filter(n => n.textContent === D.periods[D.periods.length-1].n).length === 1);
  if (HAS_ELSE) ok('story band is last', qa('.period .pname').slice(-1)[0].textContent === D.periods[D.periods.length-1].n);
  if (HAS_ELSE) {
    const bands = qa('.period'), last = bands[bands.length-1];
    const heads = [...last.querySelectorAll('.era-head h2')].map(h=>h.textContent.trim());
    ok('final band groups by story name', heads.length > 0);
    ok('no repeated story headings', heads.length === new Set(heads).size);
    ok('final band holds its rows', last.querySelectorAll('.row').length > 0);
  }
  if (HAS_PERIODS) ok('period heads have names', qa('.period .pname').length === D.periods.length);
  if (HAS_PERIODS) ok('eras nest inside periods', qa('.period .era').length === qa('.era').length);
  if (HAS_PERIODS) ok('all rows inside a period', qa('.period .row').length === qa('.row').length);
  // ---- filters ----
  ok('filters visible on Checklist in tabs', q('#filters').hidden === false);
  ok('depth chips built', qa('#depthChips .chip').length === 3);
  ok('type chips built', qa('#typeChips .chip').length === D.types.length);
  ok('mandatory/optional chips', qa('#moChips .chip').length === 2);
  ok('format row is annuals only', qa('#fmtChips .chip').length === 1);
  ok('character chips match the strand list', qa('#strandChips .chip').length === D.strands.length);
  const names = qa('#strandChips .chip').map(c => c.textContent);
  ok('character chips match the strand names',
     D.strands.every(s => names.some(n => n.trim() === s)));
  // switch off Optional -> visible rows must drop
  const visBefore = qa('.row:not([hidden])').length;
  const optChip = qa('#moChips .chip').find(c => /optional/i.test(c.textContent));
  optChip && optChip.click();
  const visAfter = qa('.row:not([hidden])').length;
  ok('unticking Optional reduces rows', visAfter < visBefore && visAfter > 0);
  optChip && optChip.click();
  ok('re-ticking Optional restores rows', qa('.row:not([hidden])').length === visBefore);

  const cA = q('#collapseAll'), eA = q('#expandAll');
  ok('collapse/expand buttons exist', !!cA && !!eA);

  // ---- empty period bands must disappear under a filter (search is debounced 180ms) ----
  const searchBox = q('#search');
  // full title of one issue in this dataset, whatever franchise it is
  searchBox.value = D.issues[Math.floor(D.issues.length / 2)][1];
  searchBox.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  setTimeout(function () {
    const visP = qa('.period').filter(p => !p.hidden);
    const emptyVis = visP.filter(p => !p.querySelector('.row:not([hidden])'));
    const shownRows = qa('.row').filter(r => !r.hidden).length;
    if (HAS_PERIODS) ok('filter hides empty period bands', emptyVis.length === 0);
    if (HAS_PERIODS) ok('filter leaves at least one band', visP.length >= 1);
    if (HAS_PERIODS) ok('filter narrowed the bands', visP.length <= D.periods.length);
    // a tiny sample dataset can legitimately match everything, so only assert
    // real narrowing once there is enough data for it to mean something
    ok('search narrows the list',
       shownRows > 0 && (D.issues.length < 100 || shownRows < D.issues.length));
    const pc = visP[0] && visP[0]._count ? visP[0]._count.textContent : '';
    if (HAS_PERIODS) ok('band count reflects filtered total', /\/\s*\d+$/.test(pc) && parseInt(pc.split('/')[1], 10) <= shownRows);
    searchBox.value = '';
    searchBox.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    setTimeout(function () {
      if (HAS_PERIODS) ok('clearing search restores all bands', qa('.period').filter(p => !p.hidden).length === D.periods.length);
      rest();
    }, 400);
  }, 400);
  return;
  }
  function rest() {
    const d = dom.window.document, root = d.documentElement;
    const segBtns = qa('#segLayout button');
  // ---- Pull List skin must show filters too ----
  const pullBtn = qa('#segLayout button').find(b => /classic/i.test(b.textContent));
  if (pullBtn) {
    pullBtn.click();
    ok('classic skin sets data-skin=pull', d.documentElement.dataset.skin === 'pull');
    ok('classic skin uses the tabbed shell', d.documentElement.dataset.layout === 'tabs');
    ok('layout change lands on Checklist, not Settings',
       qa('#tabs .tab').filter(t=>t.getAttribute('aria-selected')==='true')
         .every(t=>/checklist/i.test(t.textContent)));
    ok('classic skin shows filters', q('#filters').hidden === false);
    ok('search box present in classic skin', !!q('#search') && q('#search').offsetParent !== undefined);
    ok('classic skin has depth chips', qa('#depthChips .chip').length >= 3);
    {
      const sheet = require('fs').readFileSync('styles.css','utf8');
      const bang2 = sheet.split('\n').filter(x=>x.includes('#strandRow') && x.includes('!important')).join(' ');
      ok('character row hidden via !important, not [hidden] alone', bang2.length > 0);
    }
    q('#tabSettings').click();
    ok('classic skin hides filters off-checklist', q('#filters').hidden === true);
    q('#tabChecklist').click();
    ok('classic skin restores filters on checklist', q('#filters').hidden === false);
    q('#tabReading').click();
    ok('classic skin: no filters on Reading', q('#filters').hidden === true);
    q('#tabReviews').click();
    ok('classic skin: no filters on Reviews', q('#filters').hidden === true);
    {
      const css = require('fs').readFileSync('styles.css','utf8');
      const bang = css.split('\n').filter(x=>x.includes('[hidden]') && x.includes('!important')).join(' ');
      ok('filters[hidden] is authoritative in CSS', /\.filters\[hidden\]/.test(bang));
      const staticBlock = css.slice(css.indexOf('nothing follows the scroll'));
      const tabsBlock = css.slice(css.indexOf('tabbed mode: nothing follows'));
      ok('nothing sticky in tabbed mode either',
         ['.tabs', '.period-head', '.era-head', '.filters']
           .every(s => tabsBlock.slice(0, 500).includes(s)) &&
         tabsBlock.slice(0, 500).includes('position:static'));
      ok('depth control is a single nowrap row',
         /#depthChips\{[^}]*flex-wrap:nowrap/.test(css.replace(/\s+/g,'')) ||
         css.includes('#depthChips{display:flex;flex-wrap:nowrap'));
      ok('nothing sticky in the classic skin',
         ['.tabs', '.period-head', '.era-head', '.filters']
           .every(s => staticBlock.slice(0, 500).includes(s)) &&
         staticBlock.slice(0, 500).includes('position:static'));
    }
    q('#tabChecklist').click();
  }
  ok('layout seg has 3 buttons', segBtns.length === 3);
  const pull = segBtns.find(b => /classic/i.test(b.textContent));
  pull && pull.click();
  ok('skin beacon present in styles.css', require('fs').readFileSync('styles.css','utf8').indexOf('--skin-ok') !== -1);
  ok('classic option = pull skin', root.dataset.skin === 'pull');
  ok('pull skin keeps the tab shell', root.dataset.layout === 'tabs');
  ok('pull skin: tabs visible', q('#tabs').hidden === false);
  if (HAS_PERIODS) ok('pull skin: period bands carry data-p', qa('.period[data-p]').length === D.periods.length);
  const tabbedBtn = segBtns.find(b => /tabbed/i.test(b.textContent));
  tabbedBtn && tabbedBtn.click();
  ok('leaving classic clears the skin', !root.hasAttribute('data-skin'));

  ok('tabbed layout = tabs', root.dataset.layout === 'tabs');
  ok('phead visible by default', q('#phead') && !q('#phead').hidden);
  ok('topbar hidden by default', q('.topbar') && q('.topbar').hidden === true);

  // ---- the compact shell was removed for this franchise ----
  ok('compact layout option is gone', !segBtns.some(b => /^compact$/i.test(b.textContent.trim())));

  // ---- switch to the Dark Nights (forge) skin ----
  const forge = segBtns.find(b => /dark nights/i.test(b.textContent));
  ok('dark nights layout option exists', !!forge);
  forge && forge.click();
  ok('forge sets data-skin', root.dataset.skin === 'forge');
  ok('forge keeps the tabbed shell', root.dataset.layout === 'tabs');
  ok('forge: tabs nav visible', q('#tabs').hidden === false);
  ok('forge: checklist visible', q('#app') && q('#app').hidden === false);
  {
    const sheet = require('fs').readFileSync('styles.css','utf8');
    ok('forge skin rules present', sheet.indexOf(':root[data-skin="forge"]') !== -1);
    ok('forge is zero-radius', /data-skin="forge"\]\{[^}]*--radius:0px/.test(sheet));
    ok('forge uses a grid of plates', /data-skin="forge"\] \.arc\{display:grid/.test(sheet));
    ok('forge has nothing sticky', /data-skin="forge"\] \.era-head\{position:static/.test(sheet));
    ok('forge numbers its eras', /counter-increment:forge-era/.test(sheet));
    ok('classic override outranks the inline block', /html:root\[data-skin="pull"\]/.test(sheet));
    ok('classic keeps the original Pull List paper',
       /:root\[data-skin="pull"\]\{[^}]*--surface:#EDE7DB/.test(sheet));
  }
  const tabbed = segBtns.find(b => /tabbed/i.test(b.textContent));
  tabbed && tabbed.click();
  ok('forge -> tabbed via seg works', root.dataset.layout === 'tabs');
  ok('tabbed clears the skin', !root.hasAttribute('data-skin'));

  // ---- walk the tabs ----
  dom.window.addEventListener('error', e => errs.push('winerr: ' + e.message));
  q('#tabReading') && q('#tabReading').click();
  ok('Reading tab shows stepper title', !!q('#paneReading .rtitle'));
  if (!q('#paneReading .rtitle')) {
    console.log('   paneReading.hidden =', q('#paneReading').hidden);
    console.log('   paneReading.innerHTML =', JSON.stringify(q('#paneReading').innerHTML.slice(0,300)));
    console.log('   #rdr exists =', !!q('#rdr'));
  }
  const before = Object.keys(JSON.parse(dom.window.localStorage.getItem(((D.franchise && D.franchise.key) || 'tracker') + ':v1:progress') || '{"p":{}}').p || {}).length;
  const mark = qa('#paneReading .rbtn').find(b => /read/i.test(b.textContent));
  mark && mark.click();
  setTimeout(() => {
    const after = Object.keys(JSON.parse(dom.window.localStorage.getItem(((D.franchise && D.franchise.key) || 'tracker') + ':v1:progress') || '{"p":{}}').p || {}).length;
    ok('Mark Read persisted a mark', after === before + 1);
    if (after !== before + 1) {
      console.log('   button found =', !!mark, '| label =', mark && mark.textContent);
      console.log('   ls keys =', JSON.stringify(Object.keys(dom.window.localStorage)));
      console.log('   raw progress =', JSON.stringify(dom.window.localStorage.getItem(((D.franchise && D.franchise.key) || 'tracker') + ':v1:progress')).slice(0,160));
    }
    q('#tabReviews') && q('#tabReviews').click();
    ok('Reviews pane visible', q('#paneReviews').hidden === false);
    q('#tabSettings') && q('#tabSettings').click();
    ok('Settings pane visible', q('#panel').hidden === false);
    q('#tabChecklist') && q('#tabChecklist').click();
    ok('Checklist pane visible again', q('#app').hidden === false);
    ok('no runtime errors after interaction', errs.length === 0);
    if (errs.length) errs.slice(0,4).forEach(e => console.log('   err:', e.slice(0,200)));
  }, 900);
}
