// 幸运渡鸦 Mobile PWA 核心游戏引擎（100% 兼容 PC 端 SaveData JSON，内置离线巡逻、隐藏主动互动机制、iOS/安卓统一计步与 WebAudio 音效）
window.TLR_ENGINE = (function () {
  const CAT = window.TLR_CATALOG;
  const STORAGE_KEY = 'the_lucky_raven_save_v1';

  const PATROL_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分钟巡逻一次
  const MAX_OFFLINE_PATROLS = 72;           // 单次离线最多补结算 72 轮（6 小时）
  const STEPS_PER_ROLL = 20;                // 每走 20 步触发 1 次礼盒掉落判定（iOS 与安卓完全统一）
  const SHOP_REFRESH_COST = 30;
  const SHOP_REFRESH_EVERY_BOXES = 50;
  const DRAGON_SCALE_PRICE = 300;
  const MAX_DRAGON_SCALES_PER_ITEM = 3;
  const MAX_BOGE_STACKS = 3;
  const BOGE_BONUS_PER_STACK = 7.0;
  const BOGE_DOUBLE_DROP_CHANCE = 0.25;
  const RUI_DOUBLE_OPEN_CHANCE = 0.22;
  const SLOT_PITY_RED = 99;
  const SLOT_PITY_PINK = 199;
  const MAX_NORMAL_SHOWCASE = 36;
  const MAX_SET_SHOWCASE = 60;

  const UPGRADE_DIFF = [0.0, 8.0, 2.5, 0.80, 0.25, 0.06, 0.015, 0.002];
  const FORGE_CHANCE = [82.0, 68.0, 55.0, 44.0, 34.0, 25.0, 18.0, 12.0, 8.0, 5.0];

  function uid() {
    return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  }

  function formatNow(includeSec) {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    return includeSec ? `${base}:${p(d.getSeconds())}` : base;
  }

  // ==================== 数值公式（与 PC 端 100% 一致） ====================
  function getMeta(rarity) {
    return CAT.RARITIES[Math.max(0, Math.min(7, rarity | 0))] || CAT.RARITIES[0];
  }

  function getItemStars(lv) {
    if (lv >= 6) return 3;
    if (lv >= 3) return 2;
    return 1;
  }

  function getStarBadge(lv) {
    const s = getItemStars(lv);
    return s >= 3 ? '★★★' : (s === 2 ? '★★' : '');
  }

  function getRoleSetsForItem(itemId) {
    return CAT.ROLE_SETS.filter((s) => s.itemIds.indexOf(itemId) >= 0);
  }

  function isRoleSetItem(itemId) {
    return getRoleSetsForItem(itemId).length > 0;
  }

  function getRoleSetLabelForItem(itemId) {
    return getRoleSetsForItem(itemId).map((s) => s.name).join(' / ');
  }

  function getEnhancedValue(item, lv) {
    if (!item) return 0;
    if (!lv || lv <= 0) return item.price;
    let mult = 1.0 + 0.35 * lv + 0.08 * lv * lv;
    const st = getItemStars(lv);
    if (st === 2) mult *= 1.15;
    else if (st >= 3) mult *= 1.35;
    return Math.round(item.price * mult);
  }

  // 防无限刷仿真币：强化物品售出折旧回收价
  function getSellBaseValue(item, lv) {
    if (!item) return 0;
    if (!lv || lv <= 0) return item.price;
    const capped = Math.min(7, lv);
    return Math.round(item.price * (1.0 + 0.05 * capped));
  }

  function getDisassembleSlips(rarity, lv) {
    const table = [1, 2, 5, 12, 30, 80, 180, 400];
    const base = table[Math.max(0, Math.min(7, rarity | 0))] || 1;
    const bonus = lv > 0 ? Math.min(16, lv * 2) : 0;
    return base + bonus;
  }

  function getForgeSlipCost(rarity, curLv) {
    const baseTable = [1, 2, 4, 8, 16, 35, 70, 120];
    const base = baseTable[Math.max(0, Math.min(7, rarity | 0))] || 1;
    const lv = Math.max(0, curLv | 0);
    const mults = [1.0, 1.5, 2.2, 3.2, 4.5, 6.0, 8.0, 10.0];
    const m = lv < mults.length ? mults[lv] : (10.0 + (lv - 7) * 2.5);
    return Math.max(1, Math.round(base * m));
  }

  function getShopBuyPrice(item) {
    if (!item) return 0;
    let p = Math.ceil(item.price * 1.25);
    if (p <= item.price) p = item.price + 1;
    return p;
  }

  function applyGoldSellBonus(val) {
    if (val <= 0) return 0;
    const b = Math.round(val * 1.15);
    return b > val ? b : val + 1;
  }

  function createDefaultSave() {
    return {
      SchemaVersion: 4,
      Coins: 0,
      TotalInteractions: 0,
      TotalBoxesDropped: 0,
      TotalBoxesOpened: 0,
      TotalCoinsEarned: 0,
      LastShopRefreshUtc: new Date().toISOString(),
      BoxesOpenedSinceShopRefresh: 0,
      DragonScaleCount: 0,
      ReimbursementSlipCount: 0,
      ShopHasDragonScale: false,
      ShopDragonScalePurchased: false,
      SlotTotalSpins: 0,
      SlotPityRed: 0,
      SlotPityPink: 0,
      PermanentCabbageForgeBonus: false,
      ClaimedV280WinterGift: false,
      LastClaimedUpdateRewardVersion: '',
      LastSeenNoticeVersion: '',
      MobilePatrolLastUtc: new Date().toISOString(),
      MobileTotalSteps: 0,
      PendingBoxes: [],
      Inventory: [],
      ForgedItems: [],
      ShowcaseItems: [],
      Codex: [],
      ShopOffers: [],
      Settings: {
        DropChancePercent: 1.0,
        ShowDropToast: true,
        EnableSound: true,
        MinimizeToTrayOnClose: true
      }
    };
  }

  function normalizeSave(raw) {
    const def = createDefaultSave();
    const d = Object.assign({}, def, raw || {});
    d.SchemaVersion = 4;
    d.Coins = Math.max(0, Number(d.Coins) || 0);
    d.TotalInteractions = Math.max(0, Number(d.TotalInteractions) || 0);
    d.TotalBoxesDropped = Math.max(0, Number(d.TotalBoxesDropped) || 0);
    d.TotalBoxesOpened = Math.max(0, Number(d.TotalBoxesOpened) || 0);
    d.TotalCoinsEarned = Math.max(0, Number(d.TotalCoinsEarned) || 0);
    d.BoxesOpenedSinceShopRefresh = Math.max(0, Number(d.BoxesOpenedSinceShopRefresh) || 0);
    d.DragonScaleCount = Math.max(0, Number(d.DragonScaleCount) || 0);
    d.ReimbursementSlipCount = Math.max(0, Number(d.ReimbursementSlipCount) || 0);
    d.SlotTotalSpins = Math.max(0, Number(d.SlotTotalSpins) || 0);
    d.SlotPityRed = Math.max(0, Number(d.SlotPityRed) || 0);
    d.SlotPityPink = Math.max(0, Number(d.SlotPityPink) || 0);
    d.MobileTotalSteps = Math.max(0, Number(d.MobileTotalSteps) || 0);
    d.PendingBoxes = Array.isArray(d.PendingBoxes) ? d.PendingBoxes : [];
    d.Inventory = Array.isArray(d.Inventory) ? d.Inventory : [];
    d.ForgedItems = Array.isArray(d.ForgedItems) ? d.ForgedItems : [];
    d.ShowcaseItems = Array.isArray(d.ShowcaseItems) ? d.ShowcaseItems : [];
    d.Codex = Array.isArray(d.Codex) ? d.Codex : [];
    d.ShopOffers = Array.isArray(d.ShopOffers) ? d.ShopOffers : [];
    d.Settings = Object.assign({}, def.Settings, d.Settings || {});
    d.Settings.DropChancePercent = 1.0;
    if (!d.MobilePatrolLastUtc) d.MobilePatrolLastUtc = new Date().toISOString();
    return d;
  }

  // ==================== Web Audio API 内存合成音效 ====================
  const CozyAudio = (function () {
    let ctx = null;
    function getCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) {}
      }
      return ctx;
    }
    function tone(freq, startOff, dur, gainVal, type) {
      const c = getCtx();
      if (!c) return;
      const now = c.currentTime + startOff;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, gainVal), now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }
    return {
      playDrop(rarity, epic, coolRui, isDouble) {
        if (isDouble) {
          [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.075, 0.26, 0.14, coolRui ? 'sawtooth' : 'triangle'));
          return;
        }
        if (coolRui) {
          [440, 554.37, 659.25, 880, 1174.66].forEach((f, i) => tone(f, i * 0.07, 0.25, 0.12, 'sawtooth'));
          return;
        }
        const notes = rarity >= 4 ? [587.3, 740, 880, 1174.7] : (rarity >= 2 ? [523.25, 659.25, 784] : [523.25, 659.25]);
        notes.forEach((f, i) => tone(f, i * 0.07, epic ? 0.36 : 0.24, epic ? 0.15 : 0.12, epic ? 'sawtooth' : 'triangle'));
      },
      playOpen(rarity, softHao, coolRui) {
        const t = coolRui ? 'sawtooth' : (softHao ? 'sine' : 'triangle');
        const notes = rarity >= 6 ? [440, 523.25, 659.25, 784, 1046.5, 1318.5]
                    : rarity >= 4 ? [392, 493.9, 587.3, 784, 1046.5]
                    : [523.25, 659.25, 784, 987.8];
        notes.forEach((f, i) => tone(f, i * 0.075, softHao ? 0.42 : 0.30, softHao ? 0.10 : 0.13, t));
      },
      playCoin() {
        tone(987.77, 0, 0.18, 0.11, 'sine');
        tone(1318.51, 0.06, 0.26, 0.12, 'sine');
      },
      playForge(ok, shielded) {
        if (ok) {
          [698.5, 1046.5, 1396.9].forEach((f, i) => tone(f, i * 0.08, 0.30, 0.13, 'triangle'));
        } else if (shielded) {
          [392, 523.25, 659.25].forEach((f, i) => tone(f, i * 0.09, 0.28, 0.11, 'sine'));
        } else {
          tone(250, 0, 0.20, 0.13, 'sawtooth');
          tone(160, 0.14, 0.26, 0.12, 'sawtooth');
        }
      },
      playTap() {
        tone(540 + Math.random() * 140, 0, 0.08, 0.07, 'sine');
      }
    };
  })();

  // ==================== 游戏状态引擎实例 ====================
  class MobileGameEngine {
    constructor() {
      this.data = createDefaultSave();
      this.recentTaps = []; // 隐藏机制：追踪最近 120 秒内主动互动频率
      this.stepBuffer = 0;  // 距离下一次走路判定已累计的步数
      this.listeners = [];
      this.load();
    }

    onChange(fn) { this.listeners.push(fn); }
    emit() { this.listeners.forEach((fn) => { try { fn(); } catch (e) {} }); }

    load() {
      let isFirst = false;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          isFirst = true;
          this.data = createDefaultSave();
        } else {
          this.data = normalizeSave(JSON.parse(raw));
        }
      } catch (e) {
        isFirst = true;
        this.data = createDefaultSave();
      }
      if (isFirst) {
        this._createBox(0, '渡鸦初遇赠礼');
      }
      if (this.data.ShopOffers.length !== 3) {
        this._refreshShop();
      }
      this.save();
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (e) {}
    }

    // ==================== 存档互通（PC↔PC / 手机↔电脑） ====================
    exportSaveJson() {
      this.save();
      return JSON.stringify(this.data);
    }

    exportSaveCode() {
      const json = this.exportSaveJson();
      const utf8Bytes = new TextEncoder().encode(json);
      let bin = '';
      for (let i = 0; i < utf8Bytes.length; i++) bin += String.fromCharCode(utf8Bytes[i]);
      return 'TLR_SAVE:' + btoa(bin);
    }

    importSaveText(rawText) {
      if (!rawText || !rawText.trim()) return { ok: false, message: '存档内容为空' };
      try {
        let s = rawText.trim().replace(/^\uFEFF/, '');
        if (s.toUpperCase().startsWith('TLR_SAVE:')) {
          const b64 = s.slice('TLR_SAVE:'.length).trim();
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          s = new TextDecoder('utf-8').decode(bytes).trim().replace(/^\uFEFF/, '');
        }
        if (!s.startsWith('{') || !s.endsWith('}')) {
          return { ok: false, message: '不是有效的《幸运渡鸦》JSON 存档或存档码' };
        }
        const parsed = JSON.parse(s);
        if (typeof parsed !== 'object' || parsed === null) return { ok: false, message: '存档结构无效' };
        // 先在本地备份旧存档
        try { localStorage.setItem(STORAGE_KEY + '_backup', JSON.stringify(this.data)); } catch (e) {}
        this.data = normalizeSave(parsed);
        if (this.data.ShopOffers.length !== 3) this._refreshShop();
        this.data.MobilePatrolLastUtc = new Date().toISOString();
        this.save();
        this.emit();
        return {
          ok: true,
          message: `导入成功！已同步 ${this.data.Coins.toLocaleString()} 仿真币 · ${this.data.PendingBoxes.length} 个礼盒 · 图鉴 ${this.data.Codex.length}/${CAT.ITEMS.length}`
        };
      } catch (e) {
        return { ok: false, message: '存档解析失败：' + (e.message || e) };
      }
    }

    // ==================== 版本奖励 & 公告状态 ====================
    tryClaimV280WinterGift() {
      if (this.data.ClaimedV280WinterGift) return null;
      this.data.ClaimedV280WinterGift = true;
      for (let i = 0; i < 3; i++) this._createBox(5, 'v2.8.0 冬季更新赠礼');
      this._addNormalItem('k_11');
      this.save();
      this.emit();
      return '🎁 已领取冬季限定赠礼：红色神话礼盒 × 3 + 冬季粉色限定「雪人手办」× 1！';
    }

    isCurrentRewardClaimed() {
      return (this.data.LastClaimedUpdateRewardVersion || '') === CAT.APP_VERSION;
    }

    tryClaimCurrentUpdateReward() {
      if (this.isCurrentRewardClaimed()) return null;
      const rw = CAT.CURRENT_UPDATE_REWARD;
      this.data.LastClaimedUpdateRewardVersion = CAT.APP_VERSION;
      const src = `v${CAT.APP_VERSION} 版本更新奖励`;
      for (let i = 0; i < (rw.pink || 0); i++) this._createBox(6, src);
      for (let i = 0; i < (rw.red || 0); i++) this._createBox(5, src);
      for (let i = 0; i < (rw.gold || 0); i++) this._createBox(4, src);
      this.save();
      this.emit();
      return `🎁 已自动发放 v${CAT.APP_VERSION} 版本更新奖励：${rw.summary}！`;
    }

    hasUnseenNotice() {
      return (this.data.LastSeenNoticeVersion || '') !== CAT.APP_VERSION;
    }

    markNoticeSeen() {
      if (this.hasUnseenNotice()) {
        this.data.LastSeenNoticeVersion = CAT.APP_VERSION;
        this.save();
        this.emit();
      }
    }

    // ==================== 手机版三大掉盒引擎 ====================
    // 1) 渡鸦离线巡逻挂机（每 5 分钟 1 次，爆率较高！）
    settleOfflinePatrol() {
      const nowMs = Date.now();
      let lastMs = Date.parse(this.data.MobilePatrolLastUtc);
      if (isNaN(lastMs) || lastMs > nowMs) {
        this.data.MobilePatrolLastUtc = new Date(nowMs).toISOString();
        this.save();
        return { cycles: 0, boxes: [], doubleCount: 0, nextMs: PATROL_INTERVAL_MS };
      }
      const elapsed = nowMs - lastMs;
      const rawCycles = Math.floor(elapsed / PATROL_INTERVAL_MS);
      if (rawCycles <= 0) {
        return { cycles: 0, boxes: [], doubleCount: 0, nextMs: PATROL_INTERVAL_MS - elapsed };
      }

      const cycles = Math.min(MAX_OFFLINE_PATROLS, rawCycles);
      // 推进时间戳（保留余数，确保 5 分钟倒计时丝滑精准）
      const remainder = elapsed - rawCycles * PATROL_INTERVAL_MS;
      this.data.MobilePatrolLastUtc = new Date(nowMs - remainder).toISOString();

      const sc = this.evaluateShowcase();
      // 隐藏优势：离线巡逻爆率显著高于主动连点（每次 5 分钟巡逻基础 40%，老冰套 2.0 高达 58%）
      const patrolDropChance = sc.HasLaoBing2 ? 0.58 : 0.40;
      const dropped = [];
      let doubleCount = 0;
      for (let i = 0; i < cycles; i++) {
        this.data.TotalInteractions++;
        if (Math.random() < patrolDropChance) {
          const r = this._rollBoxRarity(sc.HasLaoBing2, sc.HasGoldSet);
          dropped.push(this._createBox(r, '渡鸦离线巡逻'));
          if (sc.HasBogeSet && Math.random() < BOGE_DOUBLE_DROP_CHANCE) {
            const r2 = this._rollBoxRarity(sc.HasLaoBing2, sc.HasGoldSet);
            dropped.push(this._createBox(r2, '渡鸦巡逻·伯格双倍'));
            doubleCount++;
          }
        }
      }
      this.save();
      if (dropped.length > 0) this.emit();
      return { cycles, boxes: dropped, doubleCount, nextMs: PATROL_INTERVAL_MS - remainder };
    }

    getPatrolRemainingMs() {
      const nowMs = Date.now();
      const lastMs = Date.parse(this.data.MobilePatrolLastUtc);
      if (isNaN(lastMs)) return PATROL_INTERVAL_MS;
      const elapsed = Math.max(0, nowMs - lastMs);
      const rem = PATROL_INTERVAL_MS - (elapsed % PATROL_INTERVAL_MS);
      return rem;
    }

    // 2) 主动与渡鸦互动 + 隐藏疲劳机制（不向玩家暴露公式，频繁戳会温和降低爆率，但最低仍保底不低）
    interactWithRaven() {
      const now = Date.now();
      this.recentTaps = this.recentTaps.filter((t) => now - t <= 120000);
      this.recentTaps.push(now);
      const recentCount = this.recentTaps.length;

      const sc = this.evaluateShowcase();
      const baseTapRate = sc.HasLaoBing2 ? 0.042 : 0.026;
      // 温和衰减系数：0~15次=1.0，16~40次缓降至0.78，41~80次缓降至0.62，80+次封底0.50（绝不会降到太低）
      let factor = 1.0;
      if (recentCount > 80) factor = 0.50;
      else if (recentCount > 40) factor = 0.78 - ((recentCount - 40) / 40) * 0.16;
      else if (recentCount > 15) factor = 1.0 - ((recentCount - 15) / 25) * 0.22;

      const effectiveRate = baseTapRate * factor;
      this.data.TotalInteractions++;

      let dropped = null;
      let isDouble = false;
      if (Math.random() < effectiveRate) {
        const r = this._rollBoxRarity(sc.HasLaoBing2, sc.HasGoldSet);
        dropped = this._createBox(r, '逗弄小渡鸦');
        if (sc.HasBogeSet && Math.random() < BOGE_DOUBLE_DROP_CHANCE) {
          const r2 = this._rollBoxRarity(sc.HasLaoBing2, sc.HasGoldSet);
          const extra = this._createBox(r2, '逗弄·伯格双倍');
          if (extra.RarityValue > dropped.RarityValue) dropped = extra;
          isDouble = true;
        }
      }
      this.save();
      this.emit();

      // 俏皮反馈台词（绝不暴露具体数值，只在高频互动时偶尔给一句可爱暗示）
      const cozyLines = [
        '嘎呜！小渡鸦蹭了蹭你的指尖～',
        '小渡鸦歪着脑袋，嘴里叼着亮晶晶的小星星！',
        '扑棱棱～小渡鸦抖了抖蓬松的黑羽毛。',
        '渡鸦正在观察你的手机屏幕，看起来心情不错！'
      ];
      const subtleHints = [
        '呼呼…戳得有点晕啦，让我自己出去巡逻一会儿说不定收获更大哦～',
        '小渡鸦打了个哈欠：放我去后台散散步，每 5 分钟都会努力给你叼宝藏哒！'
      ];
      let bubble = cozyLines[Math.floor(Math.random() * cozyLines.length)];
      if (recentCount >= 28 && Math.random() < 0.35) {
        bubble = subtleHints[Math.floor(Math.random() * subtleHints.length)];
      }
      return { dropped, isDouble, bubble };
    }

    // 3) 走路掉落礼盒（苹果 iOS 与安卓完全统一算法与概率！）
    recordSteps(deltaSteps) {
      if (!deltaSteps || deltaSteps <= 0) return { dropped: null, isDouble: false };
      this.data.MobileTotalSteps += deltaSteps;
      this.stepBuffer += deltaSteps;
      let dropped = null;
      let isDouble = false;

      const sc = this.evaluateShowcase();
      const stepChance = sc.HasLaoBing2 ? 0.34 : 0.22; // 每满 20 步判定一次

      while (this.stepBuffer >= STEPS_PER_ROLL) {
        this.stepBuffer -= STEPS_PER_ROLL;
        this.data.TotalInteractions++;
        if (Math.random() < stepChance) {
          const r = this._rollBoxRarity(sc.HasLaoBing2, sc.HasGoldSet);
          const b = this._createBox(r, '散步计步掉落');
          if (!dropped || b.RarityValue > dropped.RarityValue) dropped = b;
          if (sc.HasBogeSet && Math.random() < BOGE_DOUBLE_DROP_CHANCE) {
            const r2 = this._rollBoxRarity(sc.HasLaoBing2, sc.HasGoldSet);
            const ex = this._createBox(r2, '散步·伯格双倍');
            if (ex.RarityValue > dropped.RarityValue) dropped = ex;
            isDouble = true;
          }
        }
      }
      this.save();
      this.emit();
      return { dropped, isDouble };
    }

    // ==================== 礼盒与开箱 ====================
    _createBox(rarity, source) {
      const box = {
        Id: uid(),
        RarityValue: Math.max(0, Math.min(7, rarity | 0)),
        DroppedAt: formatNow(true),
        Source: source || '日常探索'
      };
      this.data.PendingBoxes.push(box);
      this.data.TotalBoxesDropped++;
      return box;
    }

    _rollBoxRarity(hasLaoBing2, hasGoldSet) {
      let total = 0;
      const weights = CAT.RARITIES.map((r, i) => {
        let w = r.weight;
        if (hasLaoBing2) {
          const lbMult = [0.88, 0.96, 1.15, 1.32, 1.45, 1.55, 1.60, 1.60][i] || 1.0;
          w *= lbMult;
        }
        if (hasGoldSet && i === 4) w *= 2.0;
        total += w;
        return w;
      });
      let roll = Math.random() * total;
      let acc = 0;
      for (let i = 0; i < weights.length; i++) {
        acc += weights[i];
        if (roll <= acc) return i;
      }
      return 0;
    }

    getBoxOutcomeProbabilities(boxRarity, hasHaoBonus) {
      const probs = new Array(8).fill(0);
      const minTier = boxRarity | 0;
      const scale = hasHaoBonus ? 1.05 : 1.0;
      let upSum = 0;
      for (let i = minTier + 1; i < 8; i++) {
        const diff = i - minTier;
        let p = (diff >= 1 && diff < UPGRADE_DIFF.length) ? (UPGRADE_DIFF[diff] * scale) : 0;
        if (i === 6) p *= 0.35;
        else if (i === 7) p *= 0.25;
        probs[i] = p;
        upSum += p;
      }
      probs[minTier] = Math.max(0, 100.0 - upSum);
      return probs;
    }

    _pickRandomItemOfRarity(rarity) {
      const raw = CAT.ITEMS_BY_RARITY[rarity] || CAT.ITEMS_BY_RARITY[0];
      const pool = raw.filter((it) => !it.excludeDrops);
      const list = pool.length > 0 ? pool : raw;
      return list[Math.floor(Math.random() * list.length)];
    }

    _rollItemRarityForBox(boxRarity, hasHao) {
      const probs = this.getBoxOutcomeProbabilities(boxRarity, hasHao);
      const roll = Math.random() * 100.0;
      let acc = 0;
      for (let i = boxRarity; i < 8; i++) {
        acc += probs[i];
        if (roll <= acc) return i;
      }
      return boxRarity;
    }

    _advanceShopCounter() {
      this.data.BoxesOpenedSinceShopRefresh++;
      if (this.data.BoxesOpenedSinceShopRefresh >= SHOP_REFRESH_EVERY_BOXES) {
        this.data.BoxesOpenedSinceShopRefresh %= SHOP_REFRESH_EVERY_BOXES;
        this._refreshShop();
        return true;
      }
      return false;
    }

    openBox(boxId) {
      const idx = this.data.PendingBoxes.findIndex((b) => b.Id === boxId);
      if (idx < 0) return null;
      const box = this.data.PendingBoxes.splice(idx, 1)[0];
      this.data.TotalBoxesOpened++;
      const shopRefreshed = this._advanceShopCounter();
      const sc = this.evaluateShowcase();

      const boxRarity = box.RarityValue | 0;
      const itemRarity = this._rollItemRarityForBox(boxRarity, sc.HasHaoSet);
      const item = this._pickRandomItemOfRarity(itemRarity);
      const isNew = this._addNormalItem(item.id);

      let bonusItem = null;
      let bonusIsNew = false;
      let ruiDouble = false;
      if (sc.HasRuiSet && Math.random() < RUI_DOUBLE_OPEN_CHANCE) {
        bonusItem = this._pickRandomItemOfRarity(boxRarity);
        bonusIsNew = this._addNormalItem(bonusItem.id);
        ruiDouble = true;
      }

      this.save();
      this.emit();
      return { box, item, isNew, isUpgraded: itemRarity > boxRarity, shopRefreshed, bonusItem, bonusIsNew, ruiDouble };
    }

    openAllBoxes() {
      const all = this.data.PendingBoxes.slice();
      if (all.length === 0) return [];
      this.data.PendingBoxes = [];
      const sc = this.evaluateShowcase();
      const results = [];
      for (let i = 0; i < all.length; i++) {
        const box = all[i];
        this.data.TotalBoxesOpened++;
        const shopRefreshed = this._advanceShopCounter();
        const boxRarity = box.RarityValue | 0;
        const itemRarity = this._rollItemRarityForBox(boxRarity, sc.HasHaoSet);
        const item = this._pickRandomItemOfRarity(itemRarity);
        const isNew = this._addNormalItem(item.id);

        let bonusItem = null, bonusIsNew = false, ruiDouble = false;
        if (sc.HasRuiSet && Math.random() < RUI_DOUBLE_OPEN_CHANCE) {
          bonusItem = this._pickRandomItemOfRarity(boxRarity);
          bonusIsNew = this._addNormalItem(bonusItem.id);
          ruiDouble = true;
        }
        results.push({ box, item, isNew, isUpgraded: itemRarity > boxRarity, shopRefreshed, bonusItem, bonusIsNew, ruiDouble });
      }
      this.save();
      this.emit();
      return results;
    }

    // ==================== 仓库、售卖、分解报销单 ====================
    _getNormalCount(itemId) {
      const s = this.data.Inventory.find((x) => x.ItemId === itemId);
      return s ? s.Count : 0;
    }

    _consumeNormal(itemId, count) {
      const idx = this.data.Inventory.findIndex((x) => x.ItemId === itemId);
      if (idx < 0) return;
      this.data.Inventory[idx].Count -= count;
      if (this.data.Inventory[idx].Count <= 0) this.data.Inventory.splice(idx, 1);
    }

    _addNormalItem(itemId) {
      let s = this.data.Inventory.find((x) => x.ItemId === itemId);
      if (!s) this.data.Inventory.push({ ItemId: itemId, Count: 1 });
      else s.Count++;

      let c = this.data.Codex.find((x) => x.ItemId === itemId);
      if (!c) {
        this.data.Codex.push({ ItemId: itemId, TotalObtained: 1, FirstObtainedAt: formatNow(false) });
        return true;
      }
      c.TotalObtained++;
      return false;
    }

    getOwnedItems() {
      const list = [];
      this.data.ForgedItems.forEach((f) => {
        if (!CAT.ITEM_BY_ID[f.ItemId]) return;
        list.push({
          Uid: f.Uid, ItemId: f.ItemId, Count: 1,
          EnhanceLevel: f.EnhanceLevel || 0,
          ChenFreeShieldUsed: !!f.ChenFreeShieldUsed,
          DragonScaleShieldsUsed: f.DragonScaleShieldsUsed || 0,
          BogeSuccessStacks: f.BogeSuccessStacks || 0,
          IsShowcaseEntry: false
        });
      });
      this.data.Inventory.forEach((s) => {
        if (s.Count > 0 && CAT.ITEM_BY_ID[s.ItemId]) {
          list.push({
            Uid: null, ItemId: s.ItemId, Count: s.Count,
            EnhanceLevel: 0, ChenFreeShieldUsed: false,
            DragonScaleShieldsUsed: 0, BogeSuccessStacks: 0,
            IsShowcaseEntry: false
          });
        }
      });
      return list;
    }

    getAllForgeableItems() {
      const list = [];
      this.data.ShowcaseItems.forEach((e) => {
        if (!CAT.ITEM_BY_ID[e.ItemId]) return;
        list.push({
          Uid: e.Uid, ItemId: e.ItemId, Count: 1,
          EnhanceLevel: e.EnhanceLevel || 0,
          ChenFreeShieldUsed: !!e.ChenFreeShieldUsed,
          DragonScaleShieldsUsed: e.DragonScaleShieldsUsed || 0,
          BogeSuccessStacks: e.BogeSuccessStacks || 0,
          IsShowcaseEntry: true
        });
      });
      return list.concat(this.getOwnedItems());
    }

    getEffectiveSellUnitPrice(item, lv) {
      const base = getSellBaseValue(item, lv);
      return this.evaluateShowcase().HasGoldSet ? applyGoldSellBonus(base) : base;
    }

    sellNormalItem(itemId, count) {
      const item = CAT.ITEM_BY_ID[itemId];
      if (!item || count <= 0) return 0;
      const avail = this._getNormalCount(itemId);
      const actual = Math.min(count, avail);
      if (actual <= 0) return 0;
      this._consumeNormal(itemId, actual);
      const unit = this.getEffectiveSellUnitPrice(item, 0);
      const earned = unit * actual;
      this.data.Coins += earned;
      this.data.TotalCoinsEarned += earned;
      this.save();
      this.emit();
      return earned;
    }

    sellForgedItem(uidStr) {
      const idx = this.data.ForgedItems.findIndex((f) => f.Uid === uidStr);
      if (idx < 0) return 0;
      const f = this.data.ForgedItems[idx];
      const item = CAT.ITEM_BY_ID[f.ItemId];
      if (!item) return 0;
      this.data.ForgedItems.splice(idx, 1);
      const earned = this.getEffectiveSellUnitPrice(item, f.EnhanceLevel || 0);
      this.data.Coins += earned;
      this.data.TotalCoinsEarned += earned;
      this.save();
      this.emit();
      return earned;
    }

    sellDuplicates() {
      const goldBonus = this.evaluateShowcase().HasGoldSet;
      let earned = 0;
      this.data.Inventory.forEach((s) => {
        if (s.Count > 1 && CAT.ITEM_BY_ID[s.ItemId]) {
          const item = CAT.ITEM_BY_ID[s.ItemId];
          const extra = s.Count - 1;
          s.Count = 1;
          earned += extra * (goldBonus ? applyGoldSellBonus(item.price) : item.price);
        }
      });
      if (earned > 0) {
        this.data.Coins += earned;
        this.data.TotalCoinsEarned += earned;
        this.save();
        this.emit();
      }
      return earned;
    }

    disassembleNormalItem(itemId, count) {
      const item = CAT.ITEM_BY_ID[itemId];
      if (!item || count <= 0) return { ok: false, slips: 0, message: '无效物品' };
      const avail = this._getNormalCount(itemId);
      const actual = Math.min(count, avail);
      if (actual <= 0) return { ok: false, slips: 0, message: '数量不足' };
      this._consumeNormal(itemId, actual);
      const slips = getDisassembleSlips(item.rarity, 0) * actual;
      this.data.ReimbursementSlipCount += slips;
      this.save();
      this.emit();
      return { ok: true, slips, message: `分解「${item.name}」×${actual}，获得 +${slips} 张报销单！` };
    }

    disassembleForgedItem(uidStr) {
      const idx = this.data.ForgedItems.findIndex((f) => f.Uid === uidStr);
      if (idx < 0) return { ok: false, slips: 0, message: '未找到物品' };
      const f = this.data.ForgedItems[idx];
      const item = CAT.ITEM_BY_ID[f.ItemId];
      if (!item) return { ok: false, slips: 0, message: '未知物品' };
      this.data.ForgedItems.splice(idx, 1);
      const slips = getDisassembleSlips(item.rarity, f.EnhanceLevel || 0);
      this.data.ReimbursementSlipCount += slips;
      this.save();
      this.emit();
      return { ok: true, slips, message: `分解「${item.name} +${f.EnhanceLevel}」，获得 +${slips} 张报销单！` };
    }

    disassembleByMaxRarity(maxRarity, skipSets) {
      let destroyed = 0, slips = 0;
      for (let i = this.data.Inventory.length - 1; i >= 0; i--) {
        const s = this.data.Inventory[i];
        const item = CAT.ITEM_BY_ID[s.ItemId];
        if (!item || item.rarity > maxRarity || s.Count <= 0) continue;
        if (skipSets && isRoleSetItem(item.id)) continue;
        destroyed += s.Count;
        slips += getDisassembleSlips(item.rarity, 0) * s.Count;
        this.data.Inventory.splice(i, 1);
      }
      if (slips > 0) {
        this.data.ReimbursementSlipCount += slips;
        this.save();
        this.emit();
      }
      return { destroyed, slips };
    }

    // ==================== 商店 ====================
    _refreshShop() {
      this.data.ShopOffers = [];
      const used = {};
      let guard = 0;
      while (this.data.ShopOffers.length < 3 && guard < 40) {
        guard++;
        const r = this._rollBoxRarity(false, false);
        const it = this._pickRandomItemOfRarity(r);
        if (used[it.id] && guard < 25) continue;
        used[it.id] = true;
        this.data.ShopOffers.push({ ItemId: it.id, Purchased: false });
      }
      this.data.ShopHasDragonScale = Math.random() < 0.35;
      this.data.ShopDragonScalePurchased = false;
      this.data.LastShopRefreshUtc = new Date().toISOString();
    }

    buyShopOffer(idx) {
      const offer = this.data.ShopOffers[idx];
      if (!offer || offer.Purchased) return { ok: false, message: '商品已售罄' };
      const item = CAT.ITEM_BY_ID[offer.ItemId];
      if (!item) return { ok: false, message: '未知商品' };
      const cost = getShopBuyPrice(item);
      if (this.data.Coins < cost) return { ok: false, message: `仿真币不足，还差 ${cost - this.data.Coins} 币` };
      this.data.Coins -= cost;
      offer.Purchased = true;
      const isNew = this._addNormalItem(item.id);
      this.save();
      this.emit();
      return { ok: true, isNew, message: `成功购入「${item.name}」！${isNew ? ' ★新图鉴' : ''}` };
    }

    buyDragonScale() {
      if (!this.data.ShopHasDragonScale) return { ok: false, message: '本轮未刷出开裂的龙鳞' };
      if (this.data.ShopDragonScalePurchased) return { ok: false, message: '本轮已售罄' };
      if (this.data.Coins < DRAGON_SCALE_PRICE) return { ok: false, message: `仿真币不足，需要 ${DRAGON_SCALE_PRICE} 币` };
      this.data.Coins -= DRAGON_SCALE_PRICE;
      this.data.DragonScaleCount++;
      this.data.ShopDragonScalePurchased = true;
      this.save();
      this.emit();
      return { ok: true, message: `购入「开裂的龙鳞」×1（当前 ${this.data.DragonScaleCount} 片）` };
    }

    manualRefreshShop() {
      if (this.data.Coins < SHOP_REFRESH_COST) return { ok: false, message: `手动刷新需要 ${SHOP_REFRESH_COST} 仿真币` };
      this.data.Coins -= SHOP_REFRESH_COST;
      this._refreshShop();
      this.save();
      this.emit();
      return { ok: true, message: this.data.ShopHasDragonScale ? '货架已刷新！稀有「开裂的龙鳞」上架啦！' : '已刷新神秘货架！' };
    }

    // ==================== 合成台 ====================
    synthesize(itemIds) {
      if (!itemIds || itemIds.length !== 3) return { ok: false, message: '请放入恰好 3 件同品质物品' };
      const first = CAT.ITEM_BY_ID[itemIds[0]];
      if (!first) return { ok: false, message: '包含无效材料' };
      const tier = first.rarity;
      const allSame = itemIds[0] === itemIds[1] && itemIds[1] === itemIds[2];
      const isTwoStar = tier >= 4 && allSame;
      if (tier === 7 && !isTwoStar) return { ok: false, message: '黑色遗留仅支持 3 件相同直合 2 星！' };

      const need = {};
      for (let i = 0; i < 3; i++) {
        const d = CAT.ITEM_BY_ID[itemIds[i]];
        if (!d || d.rarity !== tier) return { ok: false, message: '3 件材料必须同品质！' };
        need[d.id] = (need[d.id] || 0) + 1;
      }
      for (const k in need) {
        if (this._getNormalCount(k) < need[k]) return { ok: false, message: '仓库中未强化材料不足！' };
      }
      for (const k in need) this._consumeNormal(k, need[k]);

      if (isTwoStar) {
        this.data.ForgedItems.push({
          Uid: uid(), ItemId: first.id, EnhanceLevel: 3,
          ChenFreeShieldUsed: false, DragonScaleShieldsUsed: 0, BogeSuccessStacks: 0
        });
        this.save();
        this.emit();
        return { ok: true, isTwoStar: true, item: first, enhanceLevel: 3, isNew: false, message: `★★ 升星合成成功！「${first.name} ★★ (+3)」` };
      }
      const resItem = this._pickRandomItemOfRarity(tier + 1);
      const isNew = this._addNormalItem(resItem.id);
      this.save();
      this.emit();
      return { ok: true, isTwoStar: false, item: resItem, enhanceLevel: 0, isNew, message: `合成成功！获得 [${getMeta(resItem.rarity).label}] ${resItem.name}` };
    }

    // ==================== 老虎机 ====================
    spinSlotMachine(boxId) {
      const idx = this.data.PendingBoxes.findIndex((b) => b.Id === boxId);
      if (idx < 0) return { ok: false, message: '请先选择一个未开封礼盒！' };
      const box = this.data.PendingBoxes.splice(idx, 1)[0];
      const boxRarity = box.RarityValue | 0;
      this.data.SlotTotalSpins++;
      this.data.SlotPityRed++;
      this.data.SlotPityPink++;

      const sc = this.evaluateShowcase();
      let rolled = null;
      let redPity = false, pinkPity = false;
      if (this.data.SlotPityPink >= SLOT_PITY_PINK) {
        rolled = 6; this.data.SlotPityPink = 0; pinkPity = true;
        if (this.data.SlotPityRed >= SLOT_PITY_RED) this.data.SlotPityRed = SLOT_PITY_RED - 1;
      } else if (this.data.SlotPityRed >= SLOT_PITY_RED) {
        rolled = 5; this.data.SlotPityRed = 0; redPity = true;
      } else {
        rolled = this._rollSlotRarity(boxRarity, sc.HasPolarEasterEgg);
        if (rolled === 6) this.data.SlotPityPink = 0;
        else if (rolled === 5) this.data.SlotPityRed = 0;
      }

      let isMiss = false, item = null, isNew = false, lbFloor = false, msg = '';
      if (rolled === null) {
        if (sc.HasLaoBing1) {
          item = CAT.ITEM_BY_ID['w_01'];
          isNew = this._addNormalItem(item.id);
          lbFloor = true;
          msg = '老冰套1.0守护触发！保底获得「蓝海点8」';
        } else {
          isMiss = true;
          msg = '「下次好远哦」—— 已累计保底进度！';
        }
      } else {
        item = this._pickRandomItemOfRarity(rolled);
        isNew = this._addNormalItem(item.id);
        msg = `恭喜抽中「${item.name}」！`;
      }
      this.save();
      this.emit();
      return { ok: true, isMiss, item, isNew, redPity, pinkPity, lbFloor, message: msg };
    }

    _rollSlotRarity(boxRarity, polarEgg) {
      const tbl = [
        [58.0, 29.0, 10.0, 2.5, 0.42, 0.069, 0.01, 0.001],
        [46.0, 20.0, 24.0, 8.2, 1.5, 0.256, 0.04, 0.004],
        [32.0, 0.0, 23.0, 35.0, 8.5, 1.3, 0.18, 0.02],
        [18.0, 0.0, 0.0, 26.0, 46.0, 8.92, 1.0, 0.08],
        [0.0, 0.0, 0.0, 0.0, 72.0, 24.5, 3.25, 0.25],
        [0.0, 0.0, 0.0, 0.0, 50.0, 38.2, 11.0, 0.8],
        [0.0, 0.0, 0.0, 0.0, 28.0, 47.5, 22.0, 2.5],
        [0.0, 0.0, 0.0, 0.0, 28.0, 47.5, 22.0, 2.5]
      ];
      const w = (tbl[boxRarity] || tbl[0]).slice();
      if (polarEgg) {
        if (w[0] > 0) {
          const delta = Math.min(w[0], 10.0);
          w[0] -= delta;
          let winSum = 0;
          for (let i = 1; i < w.length; i++) winSum += w[i];
          if (winSum > 0) for (let i = 1; i < w.length; i++) if (w[i] > 0) w[i] += delta * (w[i] / winSum);
        } else {
          const shift = Math.min(w[4], 10.0);
          w[4] -= shift;
          const hi = w[5] + w[6] + w[7];
          if (hi > 0) { w[5] += shift * (w[5] / hi); w[6] += shift * (w[6] / hi); w[7] += shift * (w[7] / hi); }
        }
      }
      const roll = Math.random() * 100.0;
      let acc = 0;
      for (let i = 0; i < w.length; i++) {
        acc += w[i];
        if (roll <= acc) return i === 0 ? null : (i - 1);
      }
      return boxRarity >= 4 ? 3 : null;
    }

    // ==================== 锻造（报销单消耗 + 收藏室原地强化） ====================
    getEffectiveForgeChance(curLv, bogeStacks) {
      let rate = curLv < FORGE_CHANCE.length ? FORGE_CHANCE[Math.max(0, curLv)] : 3.0;
      const sc = this.evaluateShowcase();
      if (this.data.PermanentCabbageForgeBonus || sc.HasCabbageSet) rate += 5.0;
      if (sc.HasBogeSet && bogeStacks > 0) rate += Math.min(MAX_BOGE_STACKS, bogeStacks) * BOGE_BONUS_PER_STACK;
      return Math.min(100.0, rate);
    }

    forgeItem(uidStr, itemId, isShowcase, useDragonScale) {
      const sc = this.evaluateShowcase();
      let entry = null, idx = -1;
      if (isShowcase) {
        idx = this.data.ShowcaseItems.findIndex((x) => x.Uid === uidStr);
        if (idx < 0) return { executed: false, message: '收藏室中未找到该藏品' };
        entry = this.data.ShowcaseItems[idx];
        itemId = entry.ItemId;
      } else if (uidStr) {
        idx = this.data.ForgedItems.findIndex((x) => x.Uid === uidStr);
        if (idx < 0) return { executed: false, message: '仓库中未找到该强化物品' };
        entry = this.data.ForgedItems[idx];
        itemId = entry.ItemId;
      } else {
        if (this._getNormalCount(itemId) <= 0) return { executed: false, message: '仓库中没有该物品' };
      }

      const def = CAT.ITEM_BY_ID[itemId];
      if (!def) return { executed: false, message: '未知物品' };

      const curLv = entry ? (entry.EnhanceLevel || 0) : 0;
      const slipCost = getForgeSlipCost(def.rarity, curLv);
      if (this.data.ReimbursementSlipCount < slipCost) {
        return { executed: false, message: `报销单不足！需要 ${slipCost} 张（当前 ${this.data.ReimbursementSlipCount} 张），请去仓库分解藏品获取。` };
      }
      this.data.ReimbursementSlipCount -= slipCost;

      const prevStars = getItemStars(curLv);
      const scaleUsed = entry ? (entry.DragonScaleShieldsUsed || 0) : 0;
      const bogeStacks = entry ? (entry.BogeSuccessStacks || 0) : 0;
      const chenAvail = sc.HasChenSet && (!entry || !entry.ChenFreeShieldUsed);
      const canScale = !chenAvail && useDragonScale && this.data.DragonScaleCount > 0 && scaleUsed < MAX_DRAGON_SCALES_PER_ITEM;
      const chance = this.getEffectiveForgeChance(curLv, bogeStacks);
      if (sc.HasCabbageSet) this.data.PermanentCabbageForgeBonus = true;

      const ok = (Math.random() * 100.0) < chance;
      const res = { executed: true, succeeded: false, destroyed: false, shielded: false, ascended: false, ascendedItem: null, isNew: false, resultUid: null, isShowcase };

      if (ok) {
        const nextLv = curLv + 1;
        if (nextLv >= 8 && def.rarity < 7) {
          if (isShowcase) this.data.ShowcaseItems.splice(idx, 1);
          else if (entry) this.data.ForgedItems.splice(idx, 1);
          else this._consumeNormal(itemId, 1);

          const asc = this._pickRandomItemOfRarity(def.rarity + 1);
          res.succeeded = true; res.ascended = true; res.ascendedItem = asc;
          res.isNew = this._addNormalItem(asc.id);
          res.message = `★ +8 锻造升阶！「${def.name}」飞升为 [${getMeta(asc.rarity).label}] ${asc.name}（已收入仓库）！`;
        } else {
          if (!entry) {
            this._consumeNormal(itemId, 1);
            entry = { Uid: uid(), ItemId: itemId, EnhanceLevel: 1, ChenFreeShieldUsed: false, DragonScaleShieldsUsed: 0, BogeSuccessStacks: sc.HasBogeSet ? 1 : 0 };
            this.data.ForgedItems.push(entry);
          } else {
            entry.EnhanceLevel = nextLv;
            if (sc.HasBogeSet && (entry.BogeSuccessStacks || 0) < MAX_BOGE_STACKS) entry.BogeSuccessStacks = (entry.BogeSuccessStacks || 0) + 1;
          }
          const newStars = getItemStars(entry.EnhanceLevel);
          res.succeeded = true; res.resultUid = entry.Uid;
          const starTag = newStars > prevStars ? ` ★晋升${newStars}星！` : '';
          res.message = `强化成功！「${def.name}」升至 +${entry.EnhanceLevel}${starTag}（战力估值 ${getEnhancedValue(def, entry.EnhanceLevel)}）`;
        }
      } else {
        if (chenAvail) {
          if (!entry) {
            this._consumeNormal(itemId, 1);
            entry = { Uid: uid(), ItemId: itemId, EnhanceLevel: 0, ChenFreeShieldUsed: true, DragonScaleShieldsUsed: 0, BogeSuccessStacks: 0 };
            this.data.ForgedItems.push(entry);
          } else {
            entry.ChenFreeShieldUsed = true;
          }
          res.shielded = true; res.resultUid = entry.Uid;
          res.message = `强化失败，但「宸套」免费保护生效！保住了「${def.name} +${entry.EnhanceLevel}」`;
        } else if (canScale) {
          this.data.DragonScaleCount--;
          if (!entry) {
            this._consumeNormal(itemId, 1);
            entry = { Uid: uid(), ItemId: itemId, EnhanceLevel: 0, ChenFreeShieldUsed: false, DragonScaleShieldsUsed: 1, BogeSuccessStacks: 0 };
            this.data.ForgedItems.push(entry);
          } else {
            entry.DragonScaleShieldsUsed = (entry.DragonScaleShieldsUsed || 0) + 1;
          }
          res.shielded = true; res.resultUid = entry.Uid;
          res.message = `强化失败，消耗 1 片「开裂的龙鳞」保住了「${def.name}」（已用 ${entry.DragonScaleShieldsUsed}/3）`;
        } else {
          if (isShowcase) this.data.ShowcaseItems.splice(idx, 1);
          else if (entry) this.data.ForgedItems.splice(idx, 1);
          else this._consumeNormal(itemId, 1);
          res.destroyed = true;
          res.message = `强化失败！「${def.name}」已碎裂丢失…`;
        }
      }

      this.save();
      this.emit();
      return res;
    }

    // ==================== 收藏室（自由 36 / 套装 60 独立计数） ====================
    moveToShowcase(uidStr, itemId) {
      let fIdx = -1;
      if (uidStr) {
        fIdx = this.data.ForgedItems.findIndex((x) => x.Uid === uidStr);
        if (fIdx < 0) return { ok: false, message: '仓库中未找到该物品' };
        itemId = this.data.ForgedItems[fIdx].ItemId;
      } else {
        if (this._getNormalCount(itemId) <= 0) return { ok: false, message: '仓库中数量不足' };
      }
      const def = CAT.ITEM_BY_ID[itemId];
      if (!def) return { ok: false, message: '未知物品' };

      const isSet = isRoleSetItem(itemId);
      let normCnt = 0, setCnt = 0;
      this.data.ShowcaseItems.forEach((e) => { if (isRoleSetItem(e.ItemId)) setCnt++; else normCnt++; });
      if (isSet && setCnt >= MAX_SET_SHOWCASE) return { ok: false, message: `套装藏品展位已满（${MAX_SET_SHOWCASE}格）` };
      if (!isSet && normCnt >= MAX_NORMAL_SHOWCASE) return { ok: false, message: `自由收藏室已满（${MAX_NORMAL_SHOWCASE}格）` };

      let entry;
      if (uidStr) {
        const f = this.data.ForgedItems.splice(fIdx, 1)[0];
        entry = {
          Uid: f.Uid, ItemId: f.ItemId, EnhanceLevel: f.EnhanceLevel || 0,
          ChenFreeShieldUsed: !!f.ChenFreeShieldUsed, DragonScaleShieldsUsed: f.DragonScaleShieldsUsed || 0,
          BogeSuccessStacks: f.BogeSuccessStacks || 0
        };
      } else {
        this._consumeNormal(itemId, 1);
        entry = { Uid: uid(), ItemId: itemId, EnhanceLevel: 0, ChenFreeShieldUsed: false, DragonScaleShieldsUsed: 0, BogeSuccessStacks: 0 };
      }
      this.data.ShowcaseItems.push(entry);
      const after = this.evaluateShowcase();
      if (after.HasCabbageSet) this.data.PermanentCabbageForgeBonus = true;
      this.save();
      this.emit();
      return { ok: true, message: `已将「${def.name}」放入${isSet ? '套装展位' : '自由收藏室'}！` };
    }

    removeFromShowcase(entryUid) {
      const idx = this.data.ShowcaseItems.findIndex((e) => e.Uid === entryUid);
      if (idx < 0) return { ok: false, message: '收藏室中未找到该藏品' };
      const e = this.data.ShowcaseItems.splice(idx, 1)[0];
      if ((e.EnhanceLevel || 0) > 0 || e.ChenFreeShieldUsed || (e.DragonScaleShieldsUsed || 0) > 0 || (e.BogeSuccessStacks || 0) > 0) {
        this.data.ForgedItems.push({
          Uid: e.Uid, ItemId: e.ItemId, EnhanceLevel: e.EnhanceLevel || 0,
          ChenFreeShieldUsed: !!e.ChenFreeShieldUsed, DragonScaleShieldsUsed: e.DragonScaleShieldsUsed || 0,
          BogeSuccessStacks: e.BogeSuccessStacks || 0
        });
      } else {
        this._addNormalItem(e.ItemId);
      }
      this.save();
      this.emit();
      const def = CAT.ITEM_BY_ID[e.ItemId];
      return { ok: true, message: `已将「${def ? def.name : e.ItemId}」取回仓库！` };
    }

    evaluateShowcase() {
      const sum = {
        TotalPower: 0, NormalItemCount: 0, SetItemCount: 0,
        HasLaoBing1: false, HasLaoBing2: false, HasHaoSet: false, HasChenSet: false,
        HasCabbageSet: false, HasGoldSet: false, HasBogeSet: false, HasRuiSet: false,
        HasPolarEasterEgg: false, Items: [], ActiveSynergyTags: []
      };
      const present = {};
      const themeUnique = {};
      const rarityCounts = {};
      this.data.ShowcaseItems.forEach((e) => {
        const d = CAT.ITEM_BY_ID[e.ItemId];
        if (!d) return;
        present[d.id] = true;
        if (d.theme) {
          if (!themeUnique[d.theme]) themeUnique[d.theme] = {};
          themeUnique[d.theme][d.id] = true;
        }
        rarityCounts[d.rarity] = (rarityCounts[d.rarity] || 0) + 1;
      });

      const bestFullSet = {};
      const progMap = {};
      CAT.ROLE_SETS.forEach((set) => {
        let have = 0;
        set.itemIds.forEach((id) => { if (present[id]) have++; });
        progMap[set.id] = have;
        if (have === set.itemIds.length) {
          if (set.id === 'laobing_1') sum.HasLaoBing1 = true;
          else if (set.id === 'laobing_2') sum.HasLaoBing2 = true;
          else if (set.id === 'hao_set') sum.HasHaoSet = true;
          else if (set.id === 'chen_set') sum.HasChenSet = true;
          else if (set.id === 'cabbage_set') sum.HasCabbageSet = true;
          else if (set.id === 'gold_set') sum.HasGoldSet = true;
          else if (set.id === 'boge_set') sum.HasBogeSet = true;
          else if (set.id === 'rui_set') sum.HasRuiSet = true;
          sum.ActiveSynergyTags.push(`★ ${set.name} (${set.mult}x)`);
          set.itemIds.forEach((id) => {
            if (!bestFullSet[id] || set.mult > bestFullSet[id].mult) bestFullSet[id] = set;
          });
        }
      });
      sum.HasPolarEasterEgg = sum.HasBogeSet && sum.HasRuiSet;
      if (sum.HasPolarEasterEgg) sum.ActiveSynergyTags.push('❄ 极寒之地 · 双人共鸣');

      this.data.ShowcaseItems.forEach((e) => {
        const d = CAT.ITEM_BY_ID[e.ItemId];
        if (!d) return;
        let mult = 1.0, label = '独立陈列 1.0x', activeSetId = null;
        if (bestFullSet[d.id]) {
          mult = bestFullSet[d.id].mult;
          label = `${bestFullSet[d.id].name} ${mult}x`;
          activeSetId = bestFullSet[d.id].id;
        } else {
          CAT.ROLE_SETS.forEach((set) => {
            const p = progMap[set.id];
            if (p >= 2 && set.itemIds.indexOf(d.id) >= 0) {
              const pm = Math.min(1.70, 1.15 + 0.12 * p);
              if (pm > mult) { mult = pm; label = `${set.name}羁绊(${p}/${set.itemIds.length}) ${pm.toFixed(2)}x`; }
            }
          });
          if (d.theme && themeUnique[d.theme]) {
            const cnt = Object.keys(themeUnique[d.theme]).length;
            if (cnt >= 2) {
              const tm = Math.min(1.85, 1.10 + 0.12 * (cnt - 1));
              if (tm > mult) { mult = tm; label = `${d.theme}关联 ${tm.toFixed(2)}x`; }
            }
          }
          if ((rarityCounts[d.rarity] || 0) >= 3) { mult += 0.10; label += '+共振'; }
        }
        const baseVal = getEnhancedValue(d, e.EnhanceLevel || 0);
        const power = Math.round(baseVal * mult);
        sum.TotalPower += power;
        const isSet = isRoleSetItem(d.id);
        if (isSet) sum.SetItemCount++; else sum.NormalItemCount++;
        sum.Items.push({ Entry: e, Def: d, BaseValue: baseVal, Multiplier: mult, Power: power, SynergyLabel: label, ActiveSetId: activeSetId, IsSetItem: isSet });
      });
      return sum;
    }
  }

  // ==================== iOS 与安卓完全统一的加速度计走路计步器 ====================
  class UnifiedStepPedometer {
    constructor(onStep) {
      this.onStep = onStep;
      this.active = false;
      this.gx = 0; this.gy = 0; this.gz = 9.8;
      this.lastStepAt = 0;
      this.prevMag = 0;
      this.rising = false;
      this.wakeLock = null;
      this._handler = this._onMotion.bind(this);
    }

    async toggle() {
      if (this.active) {
        this.stop();
        return { active: false, message: '已关闭走路计步掉盒' };
      }
      if (typeof window.DeviceMotionEvent === 'undefined') {
        return { active: false, message: '当前设备或浏览器不支持运动传感器（请用手机 Safari / Chrome 打开）' };
      }
      // iOS 13+ Safari 需用户点击手势显式请求传感器权限
      if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
        try {
          const perm = await window.DeviceMotionEvent.requestPermission();
          if (perm !== 'granted') {
            return { active: false, message: '未授予运动与方向权限，无法计步（可在 Safari 设置中允许）' };
          }
        } catch (e) {
          return { active: false, message: '传感器权限请求失败：' + (e.message || e) };
        }
      }
      window.addEventListener('devicemotion', this._handler, true);
      this.active = true;
      // 尝试申请屏幕防休眠锁，让苹果和安卓在散步时都能稳定计步
      if (navigator.wakeLock && navigator.wakeLock.request) {
        try { this.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
      }
      return { active: true, message: '走路掉盒已开启！保持页面亮屏散步，每走 20 步就有几率掉落礼盒（iOS/安卓标准完全一致）' };
    }

    stop() {
      window.removeEventListener('devicemotion', this._handler, true);
      this.active = false;
      if (this.wakeLock) {
        try { this.wakeLock.release(); } catch (e) {}
        this.wakeLock = null;
      }
    }

    _onMotion(e) {
      const a = e.accelerationIncludingGravity;
      if (!a || (a.x === null && a.y === null && a.z === null)) return;
      const x = a.x || 0, y = a.y || 0, z = a.z || 0;
      // 低通滤波分离重力，确保苹果与安卓坐标系符号差异不影响合加速度模长
      this.gx = 0.85 * this.gx + 0.15 * x;
      this.gy = 0.85 * this.gy + 0.15 * y;
      this.gz = 0.85 * this.gz + 0.15 * z;
      const dx = x - this.gx, dy = y - this.gy, dz = z - this.gz;
      const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const now = Date.now();
      // 峰值检测 + 步频过滤（360ms~1400ms 且排除暴力甩手机 >16）
      if (mag > 2.0 && mag < 16.0 && mag > this.prevMag) {
        this.rising = true;
      } else if (this.rising && mag < this.prevMag && this.prevMag > 2.15) {
        this.rising = false;
        if (now - this.lastStepAt >= 360) {
          this.lastStepAt = now;
          if (this.onStep) this.onStep(1);
        }
      }
      this.prevMag = mag;
    }
  }

  return {
    PATROL_INTERVAL_MS, STEPS_PER_ROLL, SHOP_REFRESH_COST, SHOP_REFRESH_EVERY_BOXES,
    DRAGON_SCALE_PRICE, MAX_DRAGON_SCALES_PER_ITEM, MAX_NORMAL_SHOWCASE, MAX_SET_SHOWCASE,
    SLOT_PITY_RED, SLOT_PITY_PINK,
    getMeta, getItemStars, getStarBadge, getRoleSetsForItem, isRoleSetItem, getRoleSetLabelForItem,
    getEnhancedValue, getSellBaseValue, getDisassembleSlips, getForgeSlipCost, getShopBuyPrice,
    CozyAudio, MobileGameEngine, UnifiedStepPedometer
  };
})();
