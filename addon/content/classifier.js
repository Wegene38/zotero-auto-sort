/* Local topic classifier: TF-IDF + spherical k-means, no network access.
 * Pure JS with no Zotero dependency, so it can be unit-tested under Node. */

var AutoSortClassifier = (function () {
  "use strict";

  const STOPWORDS = new Set((
    "a about above across after again against all almost along also although always am among an and another any are " +
    "around as at be became because become been before being below between both but by can cannot could did do does " +
    "doing done down during each either else enough etc even ever every few for from further had has have having he " +
    "her here hers him his how however i if in into is it its itself just less like made make many may me might more " +
    "most much must my neither no nor not now of off often on once one only or other others our out over own per " +
    "perhaps rather same several she should since so some still such than that the their them then there therefore " +
    "these they this those though three through thus to together too two under until up upon us use used uses using " +
    "very via was we well were what when where whether which while who whom whose why will with within without would " +
    "yet you your " +
    // academic boilerplate
    "abstract addition additionally analysis analyses analyzed approach approaches article available based better " +
    "case cases chapter conclusion conclusions considered data demonstrate demonstrated demonstrates describe " +
    "described determine determined develop developed development different effect effects evaluate evaluated " +
    "evidence example experiment experimental experiments factor factors finally finding findings first found further " +
    "furthermore general given good great high higher highly identified identify important improve improved include " +
    "included includes including increase increased increasing indicate indicated indicates investigate investigated " +
    "key known large level levels low lower main method methods model new novel number observed obtained overall " +
    "paper particular particularly performed possible potential present presented previous previously propose proposed " +
    "provide provided provides recent recently related report reported research result resulted results review " +
    "reveal revealed reveals role second showed shown shows significant significantly similar specific studied studies " +
    "study suggest suggested suggests type types understanding work year years total compared comparison approximately " +
    "among however important elsevier springer wiley copyright rights reserved author authors published journal pdf " +
    "doi http https www com org vol issue pp sciencedirect pubmed online library researchgate properties challenges science web characterization functional integrate automated taxonomically underlying current knowledge give rise called discuss discussed encode encodes encoded mechanism mechanisms insight insights role roles across involved means"
  ).split(/\s+/));

  const CJK_STOP = new Set(("研究 分析 基于 方法 及其 进展 影响 应用 探讨 结果 表明 一种 我们 本文 通过 进行 利用 " +
    "的研 究的 中的 和的 以及 对于 关于 提出 采用 发现 主要 不同 具有 可以 其中 这些").split(/\s+/));

  function cleanText(s) {
    if (!s) return "";
    return String(s)
      .replace(/<[^>]+>/g, " ")       // inline HTML such as <i>Species</i>
      .replace(/&[a-z]+;|&#\d+;/gi, " ")
      .replace(/\s\|\s[^|]*$/, "")    // trailing " | Journal Name" from web imports
      .replace(/\s[-–]\s(ScienceDirect|Wiley Online Library|PubMed|PMC|ResearchGate|Springer\w*|Oxford Academic|NCBI|bioRxiv|MDPI)\b.*$/i, "");
  }

  // Titles that are really PDF filenames: "Author 等 - 2011 - Title.pdf"
  function cleanTitle(s) {
    s = cleanText(s);
    const m = s.match(/^.+?\s-\s\d{4}\s-\s(.+?)(?:\.pdf)?$/i);
    if (m) s = m[1];
    return s.replace(/\.pdf$/i, "");
  }

  function stem(w) {
    if (w === "leaves") return "leaf";
    if (w.length <= 3) return w;
    if (w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.endsWith("sses")) return w.slice(0, -2);
    if (w.endsWith("s") && !/(ss|us|is|ys)$/.test(w)) return w.slice(0, -1);
    return w;
  }

  /** Returns an array of {term, surface} for a text, including adjacent bigrams. */
  function extractTerms(text, surfaceMap) {
    const out = [];
    const lower = text.toLowerCase();
    // Split into runs of latin words vs CJK so bigrams never span a script boundary.
    const segments = lower.split(/[.,;:!?()[\]{}"“”'‘’\/\\|<>=+*%#@~`^]+/);
    for (const seg of segments) {
      let prev = null;
      const re = /[一-鿿]+|[a-z][a-z0-9]*(?:-[a-z0-9]+)*/g;
      let m;
      while ((m = re.exec(seg))) {
        const tok = m[0];
        if (/^[一-鿿]/.test(tok)) {
          prev = null;
          for (let i = 0; i + 1 < tok.length; i++) {
            const bg = tok.slice(i, i + 2);
            if (!CJK_STOP.has(bg)) out.push(bg);
          }
          if (tok.length === 1) continue;
          continue;
        }
        if (tok.length < 3 || STOPWORDS.has(tok) || /^\d/.test(tok)) { prev = null; continue; }
        const s = stem(tok);
        if (surfaceMap) bump(surfaceMap, s, tok);
        out.push(s);
        if (prev) {
          const bg = prev + " " + s;
          if (surfaceMap) bump(surfaceMap, bg, surfaceMap.__last + " " + tok);
          out.push(bg);
        }
        prev = s;
        if (surfaceMap) surfaceMap.__last = tok;
      }
    }
    return out;
  }

  function bump(map, key, surface) {
    let e = map.get(key);
    if (!e) map.set(key, (e = new Map()));
    e.set(surface, (e.get(surface) || 0) + 1);
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Build sparse, L2-normalised TF-IDF vectors.
   * docs: [{id, title, abstract, tags: [string]}]
   */
  function vectorize(docs, opts) {
    const surfaceMap = new Map();
    const termCounts = [];
    const df = new Map();
    for (const d of docs) {
      const counts = new Map();
      const add = (terms, w) => { for (const t of terms) counts.set(t, (counts.get(t) || 0) + w); };
      add(extractTerms(cleanTitle(d.title), surfaceMap), 3);
      add(extractTerms(cleanText(d.abstract), surfaceMap), 1);
      for (const tag of d.tags || []) {
        const t = tag.trim().toLowerCase();
        if (t.length < 2 || t.length > 40 || /^[_#]/.test(t)) continue;
        const key = "tag:" + t;
        bump(surfaceMap, key, tag.trim());
        counts.set(key, (counts.get(key) || 0) + 3);
      }
      termCounts.push(counts);
      for (const t of counts.keys()) df.set(t, (df.get(t) || 0) + 1);
    }

    const N = docs.length;
    const maxDf = Math.max(2, Math.floor(N * opts.maxDfRatio));
    const minDf = N < 30 ? 1 : 2;
    const vocabList = [...df.entries()]
      .filter(([, n]) => n >= minDf && n <= maxDf)
      .sort((a, b) => b[1] - a[1])
      .slice(0, opts.maxVocab)
      .map(([t]) => t);
    const vocab = new Map(vocabList.map((t, i) => [t, i]));
    const idf = new Float64Array(vocabList.length);
    vocabList.forEach((t, i) => { idf[i] = Math.log(N / df.get(t)); });

    const vectors = termCounts.map((counts) => {
      const idx = [], val = [];
      let norm = 0;
      for (const [t, c] of counts) {
        const i = vocab.get(t);
        if (i === undefined) continue;
        const v = (1 + Math.log(c)) * idf[i];
        idx.push(i); val.push(v); norm += v * v;
      }
      norm = Math.sqrt(norm) || 1;
      return { idx: Int32Array.from(idx), val: Float64Array.from(val, (v) => v / norm) };
    });

    const surface = vocabList.map((t) => {
      const m = surfaceMap.get(t);
      if (!m) return t;
      let best = t, n = -1;
      for (const [s, c] of m) if (c > n) { best = s; n = c; }
      return best;
    });
    return { vectors, vocabList, vocab, surface, df: vocabList.map((t) => df.get(t)) };
  }

  function dot(v, centroid) {
    let s = 0;
    for (let j = 0; j < v.idx.length; j++) s += v.val[j] * centroid[v.idx[j]];
    return s;
  }

  async function sphericalKMeans(vectors, k, dim, rand, yieldFn) {
    const n = vectors.length;
    // k-means++ seeding using cosine distance.
    const centroids = [];
    const toDense = (v) => { const c = new Float64Array(dim); for (let j = 0; j < v.idx.length; j++) c[v.idx[j]] = v.val[j]; return c; };
    centroids.push(toDense(vectors[Math.floor(rand() * n)]));
    const minDist = new Float64Array(n).fill(Infinity);
    while (centroids.length < k) {
      const last = centroids[centroids.length - 1];
      let total = 0;
      for (let i = 0; i < n; i++) {
        const d = Math.max(0, 1 - dot(vectors[i], last));
        if (d < minDist[i]) minDist[i] = d;
        total += minDist[i] * minDist[i];
      }
      let r = rand() * total, pick = n - 1;
      for (let i = 0; i < n; i++) { r -= minDist[i] * minDist[i]; if (r <= 0) { pick = i; break; } }
      centroids.push(toDense(vectors[pick]));
    }

    const assign = new Int32Array(n).fill(-1);
    let objective = 0;
    for (let iter = 0; iter < 50; iter++) {
      let changed = 0;
      objective = 0;
      for (let i = 0; i < n; i++) {
        let best = 0, bestSim = -Infinity;
        for (let c = 0; c < k; c++) {
          const s = dot(vectors[i], centroids[c]);
          if (s > bestSim) { bestSim = s; best = c; }
        }
        objective += bestSim;
        if (assign[i] !== best) { assign[i] = best; changed++; }
      }
      for (let c = 0; c < k; c++) centroids[c].fill(0);
      for (let i = 0; i < n; i++) {
        const c = centroids[assign[i]], v = vectors[i];
        for (let j = 0; j < v.idx.length; j++) c[v.idx[j]] += v.val[j];
      }
      for (let c = 0; c < k; c++) {
        let norm = 0;
        for (const x of centroids[c]) norm += x * x;
        norm = Math.sqrt(norm);
        if (norm > 0) for (let j = 0; j < dim; j++) centroids[c][j] /= norm;
      }
      if (yieldFn) await yieldFn();
      if (changed === 0) break;
    }
    return { assign, centroids, objective };
  }

  /** Pick human-readable labels: terms frequent in the cluster but rare elsewhere. */
  function labelCluster(members, vectors, vz, N) {
    const inDf = new Map();
    for (const i of members) for (const t of vectors[i].idx) inDf.set(t, (inDf.get(t) || 0) + 1);
    const size = members.length;
    const scored = [];
    for (const [t, c] of inDf) {
      if (c < Math.min(2, size)) continue;
      const pIn = c / size, pAll = vz.df[t] / N;
      let score = pIn * Math.log(pIn / pAll);
      const term = vz.vocabList[t];
      if (term.startsWith("tag:")) score *= 1.2;
      else if (term.includes(" ")) score *= 1.4;
      scored.push({ t, score, pIn });
    }
    scored.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const s of scored) {
      const term = vz.vocabList[s.t].replace(/^tag:/, "");
      if (/^[a-z]{4,}ly$/.test(term)) continue;  // adverbs ("functionally") make poor labels
      const name = vz.surface[s.t];
      // Skip terms already covered by a picked label (e.g. "genome" after "genome assembly").
      if (picked.some((p) => overlaps(p.term, term))) continue;
      picked.push({ term, name, coverage: s.pIn });
      if (picked.length >= 6) break;
    }
    // Two single words that form a known phrase ("genome" + "assembly") become that phrase.
    if (picked.length >= 2 && !/[ ]/.test(picked[0].term + picked[1].term)) {
      for (const phrase of [picked[0].term + " " + picked[1].term, picked[1].term + " " + picked[0].term]) {
        const idx = vz.vocab.get(phrase);
        if (idx !== undefined) {
          picked.splice(0, 2, { term: phrase, name: vz.surface[idx], coverage: picked[0].coverage });
          break;
        }
      }
    }
    return picked;
  }

  // "biosynthesis"/"biosynthetic", "genome assembly"/"genome" count as the same label.
  function overlaps(a, b) {
    if (a.includes(b) || b.includes(a)) return true;
    const wa = a.split(" "), wb = b.split(" ");
    return wa.some((x) => wb.some((y) => {
      if (x === y && x.length >= 3) return true;
      let i = 0;
      while (i < x.length && i < y.length && x[i] === y[i]) i++;
      return i >= 5 && i >= Math.min(x.length, y.length) - 3;
    }));
  }

  function titleCase(s) {
    return /[A-Z]/.test(s) || /[一-鿿]/.test(s) ? s : s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }

  /**
   * Main entry point.
   * docs: [{id, title, abstract, tags}]
   * returns { clusters: [{name, keywords, itemIDs, primaryCount}], unclassified: [id] }
   */
  async function classify(docs, options) {
    const opts = Object.assign({
      k: 0,                 // 0 = choose automatically
      maxVocab: 5000,
      maxDfRatio: 0.25,
      restarts: 3,
      seed: 42,
      multiLabel: true,
      secondaryRatio: 0.85, // join a second cluster if similarity >= ratio * best similarity
      secondaryMin: 0.2,
      yieldFn: null,
      onProgress: null,
    }, options || {});
    // onProgress(key, args): key is an i18n string id, see i18n.js
    const progress = (key, args) => opts.onProgress && opts.onProgress(key, args);

    progress("progress.terms");
    const vz = vectorize(docs, opts);
    const dim = vz.vocabList.length;
    const usable = [], unclassified = [];
    docs.forEach((d, i) => (vz.vectors[i].idx.length >= 2 ? usable : unclassified).push(i));
    const vectors = usable.map((i) => vz.vectors[i]);
    const n = vectors.length;
    if (n < 4 || dim === 0) {
      return { clusters: [], unclassified: docs.map((d) => d.id), k: 0 };
    }

    let k = opts.k > 0 ? opts.k : Math.round(Math.sqrt(n / 5));
    k = Math.max(2, Math.min(k, 30, Math.floor(n / 2)));

    const rand = mulberry32(opts.seed);
    let best = null;
    for (let r = 0; r < opts.restarts; r++) {
      progress("progress.cluster", { i: r + 1, n: opts.restarts });
      const res = await sphericalKMeans(vectors, k, dim, rand, opts.yieldFn);
      if (!best || res.objective > best.objective) best = res;
    }

    const members = Array.from({ length: k }, () => []);
    const extra = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) {
      members[best.assign[i]].push(i);
      if (!opts.multiLabel) continue;
      const sims = best.centroids.map((c) => dot(vectors[i], c));
      const top = sims[best.assign[i]];
      sims.forEach((s, c) => {
        if (c !== best.assign[i] && s >= opts.secondaryMin && s >= top * opts.secondaryRatio) extra[c].push(i);
      });
    }

    const clusters = [];
    for (let c = 0; c < k; c++) {
      if (!members[c].length) continue;
      const labels = labelCluster(members[c], vectors, vz, n);
      const name = labels.length ? labels.slice(0, 2).map((l) => titleCase(l.name)).join(" · ") : `Topic ${c + 1}`;
      // Most representative items first, secondary members last.
      const sim = (i) => dot(vectors[i], best.centroids[c]);
      const ordered = members[c].slice().sort((a, b) => sim(b) - sim(a));
      const ids = [...ordered, ...extra[c]].map((i) => docs[usable[i]].id);
      clusters.push({
        name,
        keywords: labels.map((l) => l.name),
        itemIDs: ids,
        primaryCount: members[c].length,
        cohesion: members[c].reduce((s, i) => s + dot(vectors[i], best.centroids[c]), 0) / members[c].length,
      });
    }
    // Dedupe names so subcollections don't collide.
    const seen = new Map();
    for (const cl of clusters) {
      const n0 = seen.get(cl.name) || 0;
      seen.set(cl.name, n0 + 1);
      if (n0) cl.name += ` (${n0 + 1})`;
    }
    clusters.sort((a, b) => b.itemIDs.length - a.itemIDs.length);
    return { clusters, unclassified: unclassified.map((i) => docs[i].id), k };
  }

  return { classify, cleanTitle, extractTerms };
})();

if (typeof module !== "undefined") module.exports = AutoSortClassifier;
