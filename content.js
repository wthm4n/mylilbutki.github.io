function cssVar(n) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(n)
        .trim();
}

// Resolve CSS custom properties that may contain calc() or vw/vh/dvh units
function resolveBookDim(varName, fallback) {
    const raw = cssVar(varName);
    if (!raw) return fallback;
    // If it's a plain number (or ends in px), parse directly
    if (/^[\d.]+px?$/.test(raw)) return parseFloat(raw);
    // For vw values
    if (raw.endsWith("vw")) return (parseFloat(raw) / 100) * window.innerWidth;
    // For dvh / vh calc expressions — measure via a probe element
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;`;
    probe.style[varName.startsWith("--BW") || varName.endsWith("BW") ? "width" : "height"] = `var(${varName})`;
    document.body.appendChild(probe);
    const measured = parseFloat(getComputedStyle(probe)[
        varName.endsWith("BW") || varName.endsWith("PW") ? "width" : "height"
    ]);
    probe.remove();
    return isFinite(measured) && measured > 0 ? measured : fallback;
}

function bookDims() {
    // Measure actual rendered dimensions via probe
    const bookOpen = document.getElementById("book-open");
    if (bookOpen && bookOpen.offsetWidth > 0) {
        const W = bookOpen.offsetWidth;
        const H = bookOpen.offsetHeight;
        const STACK = parseFloat(cssVar("--STACK")) || 0;
        return { W, H, PW: isMobile() ? W : W / 2, PH: H, ST: STACK };
    }
    const W = resolveBookDim("--BW", window.innerWidth <= 600 ? window.innerWidth : 820);
    const H = resolveBookDim("--BH", window.innerWidth <= 600 ? window.innerHeight - 56 : 560);
    const STACK = parseFloat(cssVar("--STACK")) || 0;
    return { W, H, PW: isMobile() ? W : W / 2, PH: H, ST: STACK };
}

const isMobile = () => window.innerWidth <= 600;
const isTablet = () => window.innerWidth > 600 && window.innerWidth <= 1023;

const sounds = {
    bgm: new Audio("assets/sounds/bgm.mp3"),
    pageTurn: new Audio("assets/sounds/page-turn.mp3"),
    openBook: new Audio("assets/sounds/open-book.mp3")
};

sounds.bgm.loop = true;

sounds.bgm.volume = 1;
sounds.pageTurn.volume = 0.55;
sounds.openBook.volume = 0.65;

function playBGM() {
    sounds.bgm.play().catch(() => { });
}

function playPageTurn() {
    sounds.pageTurn.currentTime = 0;
    sounds.pageTurn.play().catch(() => { });
}

function playOpenBook() {
    sounds.openBook.currentTime = 0;
    sounds.openBook.play().catch(() => { });
}

// ── Responsive photo helpers ─────────────────────────────────────────────────
// Reference page dimensions the original pixel values were designed against.
// All hardcoded top/left/right/bottom values in mkPhoto() `extra` strings are
// relative to this baseline page size (single-page width × height).
const PHOTO_BASE_PW = 410;  // baseline single-page width  (px, design target)
const PHOTO_BASE_PH = 560;  // baseline single-page height (px, design target)

/**
 * Return the current rendered single-page dimensions by measuring the
 * live Turn.js flipbook element, falling back to bookDims().
 */
function getPageDims() {
    const fb = document.getElementById("flipbook");
    if (fb && fb.offsetWidth > 0) {
        const fullW = fb.offsetWidth;
        const H     = fb.offsetHeight;
        const PW    = isMobile() ? fullW : fullW / 2;
        return { PW: Math.max(PW, 1), PH: Math.max(H, 1) };
    }
    const d = bookDims();
    return { PW: Math.max(d.PW, 1), PH: Math.max(d.PH, 1) };
}

/**
 * Convert a single CSS property value (e.g. "450px") to a % string
 * relative to the page dimension (PW for horizontal, PH for vertical).
 */
function pxToPct(valStr, dim) {
    const n = parseFloat(valStr);
    if (!isFinite(n)) return valStr;          // passthrough non-numeric
    return (n / dim * 100).toFixed(3) + "%";
}

/**
 * Walk an inline-style string and convert every pixel-valued position
 * property (top/right/bottom/left) to a percentage of the live page size.
 * Non-position properties are left unchanged.
 */
function convertPositionToPct(extraCSS, PW, PH) {
    if (!extraCSS) return "";
    return extraCSS.replace(
        /(top|bottom|right|left)\s*:\s*(-?[\d.]+)px/gi,
        (_, prop, val) => {
            const dim = (prop === "left" || prop === "right") ? PW : PH;
            return prop + ":" + pxToPct(val, dim);
        }
    );
}

/**
 * Compute a photo scale factor that keeps photos inside the page.
 * The factor is derived from the ratio of the actual page width to the
 * design baseline, with breakpoint overrides to keep things readable.
 */
function photoScale(PW) {
    const ratio = PW / PHOTO_BASE_PW;
    if (window.innerWidth <= 600)  return Math.min(ratio * 1.00, 0.82);
    if (window.innerWidth <= 1023) return Math.min(ratio * 1.10, 1.10);
    return Math.min(ratio * 1.15, 1.50);
}

function mkPhoto(key, w, h, opts = {}) {
    const { PW, PH } = getPageDims();
    const scale = photoScale(PW);

    let sw = w * scale;
    let sh = h * scale;

    // Safety clamp: photo must fit within 88 % of page in each direction
    const maxW = PW * 0.88;
    const maxH = PH * 0.88;
    if (sw > maxW) { sh *= maxW / sw; sw = maxW; }
    if (sh > maxH) { sw *= maxH / sh; sh = maxH; }

    const src = DIARY.photos[key];
    const pw = document.createElement("div");
    pw.className = "photo";
    const rot = opts.rot || Math.random() * 6 - 3;

    // Convert any hardcoded px positions in `extra` to % of live page dims
    const responsiveExtra = convertPositionToPct(opts.extra || "", PW, PH);

    pw.style.cssText = `width:${sw}px;height:${sh}px;transform:rotate(${rot}deg);${responsiveExtra}`;

    if (src) {
        const img = document.createElement("img");
        img.src = src;
        img.className = "photo-img";
        img.alt = "";
        pw.appendChild(img);
    } else {
        const ph = document.createElement("div");
        ph.className = "ph-empty";
        ph.innerHTML = `<div class="ph-ico">📷</div><span>${opts.label || "insert photo"}</span>`;
        pw.appendChild(ph);
        const lbl = document.createElement("label");
        lbl.className = "ph-upload";
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.dataset.key = key;
        lbl.appendChild(inp);
        pw.appendChild(lbl);
    }
    if (opts.tape !== false) {
        const t = document.createElement("div");
        const tc = opts.tapeColor === "b" ? "tape tape-b" : "tape tape-y";
        t.className = tc + " tape-h";
        t.style.setProperty("--r", (opts.tapeRot || 0) + "deg");
        t.style.setProperty("--t", opts.tapeT || "-7px");
        t.style.setProperty("--l", opts.tapeL || "50%");
        pw.appendChild(t);
    }
    return pw;
}
function mkAnnot(text, style, cls = "") {
    const a = document.createElement("div");
    a.className = "annot " + cls;
    a.textContent = text;
    a.setAttribute("style", style);
    return a;
}
function mkSticky(html, style, cls = "") {
    const s = document.createElement("div");
    s.className = "sticky " + cls;
    s.innerHTML = html;
    s.setAttribute("style", style);
    return s;
}
function mkDoodle(svg, style) {
    const d = document.createElement("div");
    d.className = "doodle";
    d.innerHTML = svg;
    d.setAttribute("style", style);
    return d;
}
function addStain(el) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
        const s = document.createElement("div");
        const w = 30 + Math.random() * 55,
            h2 = w * (0.45 + Math.random() * 0.45);
        const colors = [
            "rgba(160,120,50,.08)",
            "rgba(140,100,40,.06)",
            "rgba(100,70,30,.05)",
        ];
        const c = colors[Math.floor(Math.random() * colors.length)];
        s.style.cssText = `position:absolute;border-radius:50%;pointer-events:none;z-index:1;width:${w}px;height:${h2}px;left:${5 + Math.random() * 82}%;top:${4 + Math.random() * 82}%;background:radial-gradient(${c},transparent 70%);transform:rotate(${Math.random() * 360}deg)`;
        el.appendChild(s);
    }
}

const PAGE_BUILDERS = [

    /* cover inside */
    (el) => {
        el.innerHTML = `
            <div style="
                position: absolute;
                inset: 0;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
            ">
                <div style="font-size: 42px">
                    Well hewwooo
                </div>

                <div style="font-size: 32px">
                    Simmi
                </div>

                <div style="margin-top: 30px; font-size: 14px">
                    my dumass could not think of anything better TwT
                </div>
            </div>
        `;
    },

    /* p1 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-body">
                    Dear Diary,
                    <span class="br"></span>
                    Bhai sahab.
                    <span class="br-sm"></span>
                    I made a TERRIBLE decision.
                    <span class="br-sm"></span>
                    Ykw?
                    Nahi.
                    <span class="br-sm"></span>
                    A SERIES of terrible decisions.
                    <span class="br"></span>
                    Sabse pehla...
                    Talking to her.
                    <span class="br-sm"></span>
                    Dusra...
                    Talking to her even more.
                    <span class="br"></span>
                    Aur phir bhi, despite having
                    fully functional brain cells,
                    maine continue kara.
                    <span class="br"></span>
                    Looking back...
                    <span class="t-small t-red">
                        Peak intelligence.
                    </span>
                </div>
            </div>
            <div class="pg-num">1</div>
        `;
        el.appendChild(
            mkDoodle(
                `<svg width="65" height="85" viewBox="0 0 65 85">
                    <text x="4" y="38" font-size="36" font-family="serif" fill="#3C1C08" opacity=".09">?</text>
                    <text x="34" y="62" font-size="22" font-family="serif" fill="#3C1C08" opacity=".06">?</text>
                </svg>`,
                "position:absolute;bottom:38px;right:16px;z-index:3",
            ),
        );
        const ph = mkPhoto("p_11", 148, 120, {
            extra: "position:absolute;bottom:50px;right:18px;",
            tapeL: "50%",
            label: "insert photo",
        });
        el.appendChild(ph);
        el.appendChild(
            mkAnnot(
                "← yahin se downfall shuru hua tha.",
                "position:absolute;bottom:34px;right:26px;transform:rotate(-2deg)",
            ),
        );
        addStain(el);
    },

    /* p2 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-body">
                    She had been in my class for months.
                    <span class="br"></span>
                    MONTHS.
                    <span class="br-sm"></span>
                    And somehow...
                    we never actually talked.
                    <span class="br"></span>
                    Like genuinely.
                    <span class="br-sm"></span>
                    Bhai.
                    How tf this shi happened sob sob
                    <span class="br"></span>
                    Same class.
                    Same campus.
                    Same LECTURES.
                    <span class="br"></span>
                    Aur phir bhi hum dono ne
                    months nikal diye
                    without knwonin ab each others existence.
                    <span class="br"></span>
                    Honestly?
                    <span class="br-sm"></span>
                    I still don't understand that.
                    <span class="br"></span>
                    Maybe we were both stupid.
                    <span class="br-sm"></span>
                    <span class="t-small t-red">
                        Actually yeah, definitely.
                    </span>
                </div>
            </div>
            <div class="pg-num">2</div>
        `;
    },

    /* p3 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-date">—</div>
                <div class="t-body">
                    Dear Diary,
                    <span class="br"></span>
                    lowk mei ek conclusion pr aya hu..
                    <span class="br"></span>
                    This girl makes absolutely
                    no sense ._______.
                    <span class="br-sm"></span>
                    I thought if I talked to her more,
                    I'd understand her better.
                    <span class="br"></span>
                    prrrrr bc utla ho HOTA HEI HAMESHAAAAAAAA ;-;.
                </div>
            </div>
            <div class="pg-num">3</div>
        `;
        el.appendChild(
            mkDoodle(
                `<svg width="95" height="55" viewBox="0 0 95 55" fill="none">
                    <path d="M8 28 Q22 9 37 28 Q52 47 67 28 Q82 9 92 28"
                        stroke="#8B1818" stroke-width="1.4" fill="none"
                        opacity=".28" stroke-dasharray="3 3"/>
                </svg>`,
                "position:absolute;bottom:78px;left:18px",
            ),
        );
        el.appendChild(
            mkSticky(
                "Seriously.<br/>How??",
                "position:absolute;bottom:50px;left:24px;--r:-4deg;width:150px;height:150px;font-size:30px",
            ),
        );
        addStain(el);
    },

    /* p4 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-date">—</div>
                <div class="t-body">
                    Most people are easy.
                    <span class="br-sm"></span>
                    Like bc most log simple hote hei.
                    I talk to them.
                    VO SMJH AAJATE HEI..
                    <span class="br"></span>
                    Prrr noi mam to ekdummmmmmmmmmm unique piece ;----; (love ts btw ;-;).
                    <span class="br"></span>
                    The more I talked to her,
                    <span class="br-sm"></span>
                    the less I understood.
                    <span class="br"></span>
                    <span class="t-small t-blue">
                        anddddddddddd somehow...
                        jitna kam smjh aya,
                        utna hi aur jaanne ka mann kra ;-;
                    </span>
                </div>
            </div>
            <div class="pg-num">4</div>
        `;
        const ph = mkPhoto("p_5", 168, 142, {
            extra: "position:absolute;top:450px;right:16px;",
            tapeColor: "b",
            rot: -2.8,
            label: "funny photo",
        });
        el.appendChild(ph);
        el.appendChild(
            mkAnnot(
                "evidence ↑",
                "position:absolute;bottom:37px;right:20px;transform:rotate(2deg)",
            ),
        );
        addStain(el);
    },

    /* p5 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-body">
                    Dear Diary,
                    <span class="br"></span>
                    Update.
                    <span class="br"></span>
                    bhot confusing hei.
                    <span class="br-sm"></span>
                    kinda weird tooooo...
                    <span class="br-sm"></span>
                    and bina kisi baat ke meko dho deti hei :)))). PRRRRRRRRRR
                    <span class="br"></span>
                    there's a new problemmmmmm.
                    (viloaaaaa ;-;)
                    <span class="br-sm"></span>
                    sortaaaa aaadt pd gyi isss butki ki mekoo ;-;.
                    <span class="br"></span>
                    Which is honestly
                    kinda concerning.
                </div>
            </div>
            <div class="pg-num">5</div>
        `;
        mkSticky(
            "unfortunately.",
            "position:absolute;bottom:58px;right:16px;--r:3deg;width:98px",
        );
        addStain(el);
    },

    /* p6 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-body">
                    And somehow...
                    <span class="br"></span>
                    Random conversations became
                    daily conversations.
                    <span class="br"></span>
                    Daily conversations became
                    <span class="br-sm"></span>
                    "lemme tell simmi this"
                    <span class="br"></span>
                    and then somehow became
                    <span class="br-sm"></span>
                    "waittttt i forgot to tell simmi this"
                    <span class="br"></span>
                    PRRRRRRRR.
                    <span class="br"></span>
                    Genuinely.
                    <span class="br-sm"></span>
                    When tf did that happen ;-;
                    <span class="br"></span>
                    <span class="t-small t-blue">
                        this was NOT part of the original plan.
                    </span>
                </div>
                <div class="t-date">—</div>
            </div>
            <div class="pg-num">6</div>
        `;
        const ph = mkPhoto("p_7", 168, 142, {
            extra: "position:absolute;top:450px;right:16px;",
            rot: -2.8,
            label: "funny photo",
        });
        el.appendChild(ph);
        el.appendChild(
            mkAnnot(
                "THE SCIENTIFIC COMMUNITY\nSHOULD STUDY THIS.",
                "position:absolute;top:500px;left:14px;font-size:10px;max-width:155px;line-height:1.5",
                "red",
            ),
        );
        addStain(el);
    },

    /* p7 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-date">—</div>
                <div class="t-body">
                    She can somehow be:
                    <span class="br"></span>
                    sleepy,<br/>
                    ekdum UIOBANOIYAFAYEBDHAB,<br/>
                    superrrr confused,<br/>
                    and the <span class="squiggle">loudest person</span><br/>
                    in the room
                    <span class="br-sm"></span>
                    at exactly the same time PTA NI KAISE.
                    <span class="br-sm"></span>
                    I genuinely don't know how.
                </div>
            </div>
            <div class="pg-num">7</div>
        `;
        el.appendChild(
            mkPhoto("p_4", 120, 95, {
                extra: "position:absolute;top:380px;left:15px;",
                rot: -5,
            }),
        );
        el.appendChild(
            mkPhoto("p_5", 120, 95, {
                extra: "position:absolute;top:500px;right:20px;",
                rot: 4,
            }),
        );
        
        el.appendChild(
            mkSticky(
                "a talent.<br/>genuinely.",
                "position:absolute;bottom:66px;right:14px;--r:-3deg;width:108px",
            ),
        );
        addStain(el);
    },

    /* p8 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-date">—</div>
            </div>
            <div class="pg-num">8</div>
        `;
        el.appendChild(
            mkPhoto("p_6", 120, 95, {
                extra: "position:absolute;top:35px;left:15px;",
                rot: -5,
            }),
        );
        el.appendChild(
            mkPhoto("p_7", 120, 95, {
                extra: "position:absolute;top:135px;right:20px;",
                rot: 4,
            }),
        );
        el.appendChild(
            mkPhoto("p_8", 120, 95, {
                extra: "position:absolute;top:235px;left:17px;",
                rot: -3,
            }),
        );
         el.appendChild(
            mkPhoto("p_9", 120, 95, {
                extra: "position:absolute;top:335px;right:23px;",
                rot: 4,
            }),
        );
         el.appendChild(
            mkPhoto("p_10", 120, 95, {
                extra: "position:absolute;top:435px;left:16px;",
                rot: -7,
            }),
        );
        el.appendChild(
            mkPhoto("p_1", 120, 95, {
                extra: "position:absolute;top:535px;right:22px;",
                rot: 6,
            }),
        );
        addStain(el);
    },

    /* p9 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-date">—</div>
                <div class="t-body">
                    Dear Diary,
                    <span class="br"></span>
                    At some point we started hanging out more.
                    <span class="br"></span>
                    Which sounded harmless.
                    <span class="br"></span>
                    Until I realized every outing somehow ended with
                    <span class="br-sm"></span>
                    47 photos,<br/>
                    3 arguments,<br/>
                    and at least one moment where I questioned everyone's sanity.
                    <span class="br"></span>
                    Including mine.
                </div>
            </div>
            <div class="pg-num">9</div>
        `;
        addStain(el);
    },

    /* p10 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-date">—</div>
                <div class="t-body">
                    And somehow...
                    <span class="br"></span>
                    Those became some of my favorite memories.
                    <span class="br"></span>
                    Not because anything crazy happened.
                    <span class="br"></span>
                    But because even doing absolutely nothing became fun.
                    <span class="br"></span>
                    <span class="t-small t-blue">
                        still don't know how you managed that btw.
                    </span>
                </div>
            </div>
            <div class="pg-num">10</div>
        `;
        el.appendChild(
            mkPhoto("p_2", 145, 120, {
                extra: "position:absolute;bottom:40px;right:25px;",
                rot: 2,
            }),
        );
        addStain(el);
    },

    /* p11 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-body">
                    Jokes aside.
                    <span class="br"></span>
                    Somewhere between
                    the arguments,
                    the random conversations,
                    the photos,
                    and the complete nonsense...
                    <span class="br"></span>
                    you became one of my
                    favorite people.
                    <span class="br"></span>
                    Which is honestly
                    a little annoying.
                    <span class="br-sm"></span>
                    Because now I actually care ;-;
                </div>
            </div>
            <div class="pg-num">11</div>
        `;
        el.appendChild(
            mkDoodle(
                `<svg width="155" height="56" viewBox="0 0 155 56" fill="none">
                    <ellipse cx="77" cy="28" rx="68" ry="20"
                        stroke="#8B1818" stroke-width="1.4" fill="none"
                        opacity=".32" stroke-dasharray="4 3"/>
                    <text x="12" y="33"
                        font-family="'JetBrains Mono',monospace" font-size="10"
                        fill="#8B1818" opacity=".55">
                        ⚠ pyari to hei yrrrr yeeeee
                    </text>
                </svg>`,
                "position:absolute;bottom:82px;left:8px",
            ),
        );
        el.appendChild(
            mkSticky(
                ">_<",
                "position:absolute;bottom:52px;right:18px;--r:-5deg;font-size:12px",
            ),
        );
        addStain(el);
    },

    /* p12 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-body">
                    And the weird part is...
                    <span class="br"></span>
                    I don't think there was
                    one specific moment.
                    <span class="br"></span>
                    No dramatic movie scene.
                    <span class="br-sm"></span>
                    No huge event.
                    <span class="br"></span>
                    Just hundreds of tiny moments.
                    <span class="br"></span>
                    And somehow...
                    <span class="br-sm"></span>
                    they added up.
                </div>
            </div>
            <div class="pg-num">12</div>
        `;
        addStain(el);
    },

    /* p13 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-body">
                    Then I realized something.
                    <span class="br"></span>
                    Bday aara madam ka....
                    <span class="br"></span>
                    And suddenly...
                    <span class="br-sm"></span>
                    I had a problem.
                    <span class="br"></span>
                    Cz i had no idea ki kya kru, i cant visit her
                    (amazing families we got ngl), nor any gifts ;----;
                </div>
            </div>
            <div class="pg-num">13</div>
        `;
        el.appendChild(
            mkSticky(
                "gajab kismat hei bc",
                "position:absolute;bottom:60px;left:22px;--r:3deg;font-size:11.5px",
            ),
        );
        addStain(el);
    },

    /* p14 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-body">
                    So instead of buying
                    something...
                    <span class="br"></span>
                    I made something.
                    <span class="br"></span>
                    Which is either
                    very thoughtful
                    or
                    very stupid.
                    <span class="br"></span>
                    Honestly?
                    <span class="br-sm"></span>
                    Probably both.
                </div>
            </div>
            <div class="pg-num">14</div>
        `;
        el.appendChild(
            mkAnnot(
                "→ turn the page →",
                "position:absolute;bottom:50px;right:10px;font-size:11.5px;transform:rotate(-2deg)",
            ),
        );
        addStain(el);
    },

    /* p15 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-body" style="
                    text-align: center;
                    font-size: 18px;
                    line-height: 2.2;
                    margin-top: 120px;
                ">
                    Okay.
                    <span class="br"></span>
                    Enough yapping.
                    <span class="br"></span>
                    soch ri hogi kitna bk bk krta hei TwT.
                </div>
            </div>
            <div class="pg-num">15</div>
        `;
        addStain(el);
    },

    /* p16 — REVEAL */
    (el) => {
        const rc = document.createElement("div");
        rc.id = "reveal-container";
        rc.innerHTML = `
            <div class="rev-hb">happy birthday</div>
            <div class="rev-name">${DIARY.nickname}.</div>
            <div class="rev-lines">
                Thank you for the laughs.<br/>
                Thank you for the huh hto.<br/>
                Thank you for being<br/>
                the person i can share anything with <3.
            </div>
            <div class="rev-sign">
                gajab ho tum ngl <3
            </div>
        `;
        el.appendChild(rc);
        el.dataset.isReveal = "1";
        const pn = document.createElement("div");
        pn.className = "pg-num";
        pn.textContent = "16";
        el.appendChild(pn);
        addStain(el);
    },

    /* p17 */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-date">— for you —</div>
                <div class="t-body" style="font-size: 14px; line-height: 2">
                    One last thing.
                    <span class="br"></span>
                    Couldn't fit everything<br/>
                    in words.
                    <span class="br"></span>
                    So I recorded something.
                    <span class="br-sm"></span>
                    <span class="t-small">( press play )</span>
                </div>
            </div>
            <div class="pg-num">17</div>
        `;
        el.appendChild(
            mkAnnot(
                "→ over there →",
                "position:absolute;bottom:78px;right:14px;font-size:12.5px;transform:rotate(-3deg)",
            ),
        );
        addStain(el);
    },

    /* p18 — VIDEO */
    (el) => {
        el.innerHTML = `
            <div class="pcontent">
                <div class="t-date">— a message —</div>
            </div>
            <div class="pg-num">18</div>
        `;
        const vf = document.createElement("div");
        vf.className = "vid-frame";
        vf.id = "vid-frame";
        if (DIARY.photos.p_video) {
            vf.innerHTML = `<video controls src="${DIARY.photos.p_video}"></video>`;
        } else {
            vf.innerHTML = `
                <div class="vid-ph">
                    <div class="vid-play">▶</div>
                    <span>birthday video</span>
                    <span style="font-size: 8px; opacity: .45; margin-top: 2px">click to upload</span>
                </div>
                <label class="vid-upload">
                    <input type="file" accept="video/*" id="vid-inp"/>
                </label>
            `;
        }
        el.appendChild(vf);
        const sig = document.createElement("div");
        sig.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 0;
            right: 0;
            text-align: center;
            font-family: var(--font-scrawl);
            font-size: 30px;
            color: var(--ink-faded);
            opacity: .68;
            font-style: italic
        `;
        sig.textContent = "happy birthday 🎂 | agrrrr apne ashuuuuuuu se time mile to text krnaaa :)))))))";
        el.appendChild(sig);
        addStain(el);
    },
];

const TOTAL_PAGES = PAGE_BUILDERS.length;

function buildFlipbook() {
    const fb = document.getElementById("flipbook");
    fb.innerHTML = "";
    PAGE_BUILDERS.forEach((b, i) => {
        const pn = i + 1;
        const div = document.createElement("div");
        div.className = "page p" + pn + (pn % 2 === 0 ? " even" : " odd");
        b(div);
        fb.appendChild(div);
    });
}

function getDisplay() {
    return isMobile() ? "single" : "double";
}

let currentPage = 1,
    revealDone = false;
function updateMobileNav(page) {
    const ind = document.getElementById("mnav-page-indicator");
    if (ind) ind.textContent = page + " / " + TOTAL_PAGES;
}

function initTurn() {
    const $fb = $("#flipbook");
    const { W, H, ST } = bookDims();
    const fbW = isMobile() ? W : W - ST * 2;
    const fbH = H;
    const display = getDisplay();

    $fb.turn({
        width: fbW,
        height: fbH,
        duration: DIARY.flipMs,
        gradients: true,
        acceleration: true,
        display: display,
        turnCorners: "bl,br",
        elevation: 80,
        when: {
            turning(e, page, view) {
                currentPage = page;
                playPageTurn();
                updateStackVisuals(page);
                updateMobileNav(page);
            },
            turned(e, page, view) {
                currentPage = page;
                updateStackVisuals(page);
                updateMobileNav(page);
                const pages = $fb.turn("view");
                if (pages.indexOf(16) !== -1 && !revealDone) {
                    setTimeout(animateReveal, 440);
                }
                bindUploads();
            },
        },
    });

    updateStackVisuals(1);
    updateMobileNav(1);
}

function updateStackVisuals(page) {
    if (isMobile()) return;
    const pct = page / TOTAL_PAGES;
    const LE = document.getElementById("le");
    const RE = document.getElementById("re");
    const STACK = parseFloat(cssVar("--STACK")) || 14;
    const leftH = Math.round(STACK * 0.5 + STACK * 0.8 * pct);
    const rightH = Math.round(STACK * 1.3 - STACK * 0.8 * pct);
    if (LE) LE.style.width = leftH + "px";
    if (RE) RE.style.width = rightH + "px";
}

function bindUploads() {
    document.querySelectorAll(".ph-upload input").forEach((inp) => {
        if (!inp.dataset.bound) {
            inp.dataset.bound = "1";
            inp.addEventListener("change", uploadPhoto);
        }
    });
    const vi = document.getElementById("vid-inp");
    if (vi && !vi.dataset.bound) {
        vi.dataset.bound = "1";
        vi.addEventListener("change", uploadVideo);
    }
}
function uploadPhoto(e) {
    const f = e.target.files[0];
    if (!f) return;
    const key = e.target.dataset.key;
    const url = URL.createObjectURL(f);
    DIARY.photos[key] = url;
    const wrap = e.target.closest(".photo");
    wrap.querySelector(".ph-empty")?.remove();
    wrap.querySelector(".ph-upload")?.remove();
    const img = document.createElement("img");
    img.src = url;
    img.className = "photo-img";
    img.alt = "";
    wrap.insertBefore(img, wrap.firstChild);
}
function uploadVideo(e) {
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const vf = document.getElementById("vid-frame");
    if (vf)
        vf.innerHTML = `<video controls src="${url}" style="width:100%;height:100%;object-fit:cover"></video>`;
}

addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        playPageTurn();
        $("#flipbook").turn("next");
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        playPageTurn();
        $("#flipbook").turn("previous");
    }
});
document.getElementById("cover").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDiary();
    }
});

document.getElementById("mnav-prev").addEventListener("click", () => {
    playPageTurn();
    $("#flipbook").turn("previous");
});
document.getElementById("mnav-next").addEventListener("click", () => {
    playPageTurn();
    $("#flipbook").turn("next");
});

let touchStartX = 0,
    touchStartY = 0;
document.getElementById("scene").addEventListener(
    "touchstart",
    (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    },
    { passive: true },
);
document.getElementById("scene").addEventListener(
    "touchend",
    (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (
            Math.abs(dx) > Math.abs(dy) + 10 &&
            Math.abs(dx) > 50 &&
            document.getElementById("book-open").style.display !== "none"
        ) {
            playPageTurn();
            if (dx < 0) $("#flipbook").turn("next");
            else $("#flipbook").turn("previous");
        }
    },
    { passive: true },
);

function animateReveal() {
    const rc = document.getElementById("reveal-container");
    if (!rc || revealDone) return;
    revealDone = true;
    rc.classList.add("show");
    setTimeout(() => rc.querySelector(".rev-hb").classList.add("in"), 120);
    setTimeout(
        () => rc.querySelector(".rev-name").classList.add("in"),
        420,
    );
    setTimeout(
        () => rc.querySelector(".rev-lines").classList.add("in"),
        840,
    );
    setTimeout(
        () => rc.querySelector(".rev-sign").classList.add("in"),
        1440,
    );
    setTimeout(launchConfetti, 620);
    setTimeout(() => {
        playPageTurn();
    }, 860);
}

function launchConfetti() {
    const cols = [
        "#B8943C",
        "#D4B060",
        "#5C1212",
        "#F2E8D0",
        "#C4A0A0",
        "#E0D0A0",
        "#9ABCDB",
        "#E8C890",
    ];
    for (let i = 0; i < 80; i++) {
        const c = document.createElement("div");
        c.className = "cpiece";
        const w = 5 + Math.random() * 10,
            h2 = 5 + Math.random() * 10;
        c.style.cssText = `left:${Math.random() * 100}vw;top:${-18 + Math.random() * 28}px;width:${w}px;height:${h2}px;background:${cols[~~(Math.random() * cols.length)]};border-radius:${Math.random() > 0.5 ? "50%" : "2px"};animation-duration:${2.8 + Math.random() * 3.2}s;animation-delay:${Math.random() * 1.1}s;`;
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 6800);
    }
}

function openDiary() {
    playOpenBook();

    const hint = document.getElementById("hint");
    const swipeHint = document.getElementById("swipe-hint");
    if (hint) {
        hint.style.transition = "opacity .5s ease";
        hint.style.opacity = "0";
    }
    if (swipeHint) swipeHint.style.opacity = "0";

    const cover = document.getElementById("cover");
    const coverAssembly = document.getElementById("cover-assembly");
    const bw = document.getElementById("book-wrap");

    // Flip the cover open — book-open is already visible underneath
    cover.classList.add("opening");

    setTimeout(() => {
        cover.classList.add("open");
        cover.classList.remove("opening");

        bw.classList.add("opened");
        bw.style.animation = "none";

        // Once cover is fully flipped away, hide the whole cover-assembly
        setTimeout(() => {
            coverAssembly.classList.add("done");
        }, 200);

        scatterDust();
        setTimeout(() => playBGM(), 300);

        let resizeTimer;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                try {
                    const { W, H, ST } = bookDims();
                    const fbW = isMobile() ? W : W - ST * 2;
                    $("#flipbook").turn("size", fbW, H);
                } catch (e) { }
            }, 100);
        });
    }, 980);
}

document.getElementById("cover").addEventListener("click", openDiary);


document.getElementById("mbtn").addEventListener("click", () => {
    if (sounds.bgm.paused) {
        sounds.bgm.play().catch(() => { });
        document.getElementById("mbtn").textContent = "♪";
    } else {
        sounds.bgm.pause();
        document.getElementById("mbtn").textContent = "♩";
    }
});

let dustPts = [];
function initDust() {
    const c = document.getElementById("dust");
    const ctx = c.getContext("2d");
    let W, H;
    function resize() {
        W = c.width = innerWidth;
        H = c.height = innerHeight;
    }
    addEventListener("resize", resize);
    resize();
    dustPts = Array.from({ length: DIARY.particleCount }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -Math.random() * 0.2 - 0.04,
        r: Math.random() * 1.7 + 0.3,
        a: Math.random() * 0.28 + 0.05,
        life: Math.random(),
    }));
    (function frame() {
        ctx.clearRect(0, 0, W, H);
        for (const p of dustPts) {
            p.life += 0.0016;
            p.x += p.vx + Math.sin(p.life * 1.9) * 0.055;
            p.y += p.vy;
            if (p.y < -5) {
                p.y = H + 5;
                p.x = Math.random() * W;
            }
            const al = p.a * Math.sin(Math.min(p.life, 1) * Math.PI) * 0.68;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,210,125,${Math.max(0, al)})`;
            ctx.fill();
        }
        requestAnimationFrame(frame);
    })();
}
function scatterDust() {
    for (const p of dustPts) {
        p.vy = -Math.random() * 0.6 - 0.2;
        p.vx = (Math.random() - 0.5) * 0.5;
        setTimeout(() => {
            p.vy = -Math.random() * 0.2 - 0.04;
            p.vx = (Math.random() - 0.5) * 0.12;
        }, 1200);
    }
}

let mx = 0,
    my = 0,
    tmx = 0,
    tmy = 0;
addEventListener("mousemove", (e) => {
    mx = (e.clientX / innerWidth - 0.5) * 2;
    my = (e.clientY / innerHeight - 0.5) * 2;
});
(function pl() {
    tmx += (mx - tmx) * 0.055;
    tmy += (my - tmy) * 0.055;
    const bw = document.getElementById("book-wrap");
    if (bw && !bw.classList.contains("opened") && !isMobile()) {
        bw.style.transform = `translateY(${tmy * 4}px) rotate(${-0.7 + tmx * 0.5}deg)`;
    }
    requestAnimationFrame(pl);
})();

initDust();
addEventListener("load", () => {
    setTimeout(() => {
        const ov = document.getElementById("loverlay");
        ov.classList.add("out");
        setTimeout(() => ov.remove(), 1200);
    }, 600);

    // Build the flipbook immediately so it sits ready behind the cover
    setTimeout(() => {
        buildFlipbook();
        initTurn();
        bindUploads();
        document.getElementById("book-open").classList.remove("not-built");
    }, 200);
});