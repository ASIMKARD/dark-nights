import json, re
from dataset import ISSUES, ARCS, CTX

# =====================================================================
# FRANCHISE CONFIG — everything franchise-specific lives in this block.
# =====================================================================
FRANCHISE = {
    'key':       'dark-nights',
    'wordmark':  'Dark Nights',
    'title':     'Dark Nights: Metal / Death Metal \u2014 Reading Order',
    'strapline': 'Dark Multiverse reading tracker \u00b7 2017\u20132021',
    'theme':     '#7A0D2E',
    'span':      '2017\u20132021',
    'search_url': 'https://dc.fandom.com/wiki/Special:Search?query=',
    # Cover date drives the primary sort; on-sale is the alternate.
    'dual_order': {'label': 'Dates', 'a': 'Cover', 'b': 'On-sale'},
}

# NO WORKBOOK. The spec makes this build web-app-only, so the dataset is a
# Python table (dataset.py) instead of a 6-tab .xlsx. This shim is the ONLY
# deviation from the stock generator: it produces exactly the same `rows`,
# `arows`, `ctx`, `legend` and `maint` that the workbook loader produced.
# Everything below is the untouched franchise-agnostic engine.
rows  = [r for r in ISSUES if r[2] is not None]
arows = [a for a in ARCS if any(v is not None for v in a)]
print('issue rows %d | arc rows %d'%(len(rows),len(arows)))
ctx = dict(CTX)

# ---- eras, in first-appearance order down the reading order ----
eras=[]
for d in rows:
    if d[3] and d[3] not in eras and d[3] != 'Elseworlds (ALT)': eras.append(d[3])
if any(d[3]=='Elseworlds (ALT)' for d in rows): eras.append('Elseworlds (ALT)')   # appended last: keeps era indices 0-34 stable
ERA={e:i for i,e in enumerate(eras)}
print('eras:',len(eras))

# ---- strands: split Arc Master combinations into atomic bits ----
atomic=[]
for a in arows:
    for tok in re.split(r'[;,]', str(a[7] or '')):
        tok=tok.strip()
        if tok and tok!='None' and tok not in atomic: atomic.append(tok)
STR={s:i for i,s in enumerate(atomic)}
print('atomic strands: %d -> %s'%(len(atomic),atomic))
assert len(atomic)<=31, 'strand bitmask would overflow 32-bit'

types=[]
for d in rows:
    if d[6] and d[6] not in types: types.append(d[6])
TYP={t:i for i,t in enumerate(types)}
print('types:',types)

# ---- arcs, in Arc Master (timeline) order ----
arcs=[]; ARC={}
for a in arows:
    name=str(a[3])
    if name in ARC: continue
    mask=0
    for tok in re.split(r'[;,]', str(a[7] or '')):
        tok=tok.strip()
        if tok in STR: mask |= (1<<STR[tok])
    def num(v):
        try: return int(str(v).strip())
        except: return 0
    ARC[name]=len(arcs)
    arcs.append({'n':name,'e':ERA.get(a[2],0),'s':mask or 1,'t':TYP.get(a[8],0),
                 'm':1 if str(a[9]).upper().startswith('M') else 0,
                 'q':num(a[12]),'i':num(a[11]),'y':str(a[5] or ''),'ti':str(a[4] or ''),
                 'ch':str(a[6] or ''),'cr':str(a[13] or ''),'ke':str(a[14] or ''),
                 'co':str(a[18] or ''),'no':str(a[19] or ''),
                 'pr':(str(a[16]) if a[16] else None),'li':str(a[17] or ''),
                 'b':ctx.get(name,''),'syn':0})
print('arcs:',len(arcs))
missing=sorted({str(d[5]) for d in rows if d[5] and str(d[5]) not in ARC})
print('issue arc labels missing from Arc Master:',len(missing),missing[:5])
assert not missing

FB,SKIP,ALT,GAP,RENUM=1,2,4,8,16
issues=[]
for d in rows:
    fl=0
    f=str(d[9] or '')
    if 'FB' in f: fl|=FB
    if 'SKIP' in f: fl|=SKIP
    if 'ALT' in f: fl|=ALT
    if 'GAPNOTE' in f: fl|=GAP
    if 'RENUM' in f: fl|=RENUM
    row=[int(str(d[2])), str(d[4]), ARC[str(d[5])] if d[5] else 0, TYP.get(d[6],0),
         1 if str(d[7]).upper()=='M' else 0, 1 if d[8] else 0, fl, (str(d[10]) if d[10] else '')]
    if d[11]:
        try: row.append(int(str(d[11])))
        except: pass
    issues.append(row)
issues.sort(key=lambda r:r[0])

INERT=GAP|RENUM
chk=[r for r in issues if not (r[6]&INERT)]
counts={'total':len(chk),
        'core':sum(1 for r in chk if r[5]),
        'mandatory':sum(1 for r in chk if r[4]),
        'essential':sum(1 for r in chk if r[4] or r[5]),
        'gapnotes':sum(1 for r in issues if r[6]&GAP),
        'renumbers':sum(1 for r in issues if r[6]&RENUM)}
print('counts:',counts)

legend=[['\u2605','Barebones tier'],['M','Essential tier'],['\u2014','Everything tier']]
maint=[]   # spec: skip the Maintenance refresh-prompt pattern

# timeline order: arcs in Arc Master order, issues grouped by arc then sort key
tl=sorted(range(len(issues)), key=lambda i:(issues[i][2], issues[i][0]))

data={'franchise':FRANCHISE,'eras':[{'n':e,'intro':ctx.get(e,'')} for e in eras],
      'strands':atomic,'types':types,'tiers':['Barebones','Essential','Everything'],
      'arcs':arcs,'issues':issues,'legend':legend,'maintenance':maint,'counts':counts,
      'altOrder':{'note':'9th element on an issue row is its as-published key; absent means unchanged',
                  'diverging':sum(1 for r in issues if len(r)>8),'unverified':[]},
      'timeline':tl}


# ---- period bands ----
# Optional super-era bands. Leave empty for a franchise that does not need them.
# Cut at real story hinges, not round years; aim for roughly a decade each.
#   ('Name', 'label', start_sort_key, end_sort_key, 'blurb shown under the band')
# Example from a previous build:
#   ('Foundations', '1962-73', 196208000, 197308000, 'Where it all starts...'),
PERIODS = []

def period_of(key):
    k=int(key)
    for i,(n,y,a,b,bl) in enumerate(PERIODS):
        if a <= k < b: return i
    return len(PERIODS)-1
periods=[{'n':n,'y':y,'b':bl} for n,y,a,b,bl in PERIODS]
periods.append({'n':'Elseworlds','y':'what if\u2026',
  'b':'Stories from outside the main line \u2014 other realities and other lifetimes.'})
ELSE_IDX = len(periods)-1
for r in issues:
    r_period = period_of(r[0])
data['periods']=periods if PERIODS else []
def bucket(r):
    return ELSE_IDX if (ELSE_RX and ELSE_RX.search(r[1])) else period_of(r[0])
data['issuePeriod']=[bucket(r) for r in issues] if PERIODS else []

# Inside the Elseworlds band the fine eras are meaningless, so each story
# becomes its own second-tier heading and its issues group together.
# Optional alternate-reality groupings, each becoming its own heading inside
# the final band. Leave empty for none. (regex, display name, blurb)
ELSE_STORIES = []
ELSE_RX = None

story_era={}
for rx,name,blurb in ELSE_STORIES:
    story_era[name]=len(data['eras'])
    data['eras'].append({'n':name,'intro':blurb})

def era_of(r, i):
    if data['issuePeriod'][i]!=ELSE_IDX:
        return arcs[r[2]]['e']
    for rx,name,blurb in ELSE_STORIES:
        if rx.search(r[1]): return story_era[name]
    return arcs[r[2]]['e']
data['issueEra']=[era_of(r,i) for i,r in enumerate(issues)] if (PERIODS and ELSE_STORIES) else []

out='window.TRACKER_DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n'
open('data.js','w').write(out)
print('data.js written: %d bytes'%len(out))
print('eras with intro: %d/%d'%(sum(1 for e in data['eras'] if e['intro']),len(eras)))
print('arcs with blurb: %d/%d'%(sum(1 for a in arcs if a['b']),len(arcs)))
print('timeline entries:',len(tl))


# =====================================================================
# NEW-FRANCHISE CHECKLIST (engine below this line is franchise-agnostic)
#   1. Build the 6-tab workbook to the schema in README-NEXT-FRANCHISE.md
#   2. Edit FRANCHISE above; set WORKBOOK
#   3. Redefine PERIODS at the story hinges for that franchise
#   4. Redefine ELSE_STORIES / ELSE_RX (or set both empty for none)
#   5. python3 gen.py, then node test.js
#   6. Bump the cache string in sw.js and the build tag in index.html
# =====================================================================
