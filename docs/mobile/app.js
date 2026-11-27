(function () {
  const CAT = window.TLR_CATALOG;
  const ENG = window.TLR_ENGINE;
  const engine = new ENG.MobileGameEngine();
  const audio = ENG.CozyAudio;

  // UI 状态
  const ui = {
    tab: 'gifts',
    shopSub: 'shop',        // 'shop' | 'slot'
    forgeSub: 'forge',      // 'forge' | 'synth'
    showcaseSub: 'cabinet', // 'cabinet' | 'sets' | 'pick' | 'codex'
    whFilter: -1,
    cxFilter: -1,
    synthFilter: -1,
    selectedBoxId: null,
    slotBoxId: null,
    slotSpinning: false,
    slotReels: ['w_01', 'g_10', 'k_01'],
    slotLastMsg: '投入未开封礼盒，按下拉杆搏取「粉色·限定」珍品！',
    forgeUid: null,
    forgeItemId: null,
    forgeIsShowcase: false,
    forgeUseScale: true,
    forgeBanner: '',
    synthSlots: [],
    ravenBubble: '点我可以摸摸渡鸦！切后台放我每 5 分钟自由巡逻，或开启走路掉盒哦～',
    toastTimer: null
  };

  // 苹果/安卓统一计步器
  const pedometer = new ENG.UnifiedStepPedometer((stepDelta) => {
    const res = engine.recordSteps(stepDelta);
    if (res.dropped) {
      const sc = engine.evaluateShowcase();
      const m = ENG.getMeta(res.dropped.RarityValue);
      if (engine.data.Settings.EnableSound) audio.playDrop(res.dropped.RarityValue, sc.HasLaoBing2, sc.HasRuiSet, res.isDouble);
      showToast(`🚶 散步掉盒！获得 [${m.colorName}·${m.label}] 礼盒${res.isDouble ? ' ×2 (伯格双倍!)' : ''}！`);
    }
    if (ui.tab === 'gifts') updatePatrolAndStepLive();
  });

  // 工具渲染函数
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function itemSpriteHtml(itemId, size, silhouette) {
    const it = CAT.ITEM_BY_ID[itemId];
    if (!it) return '';
    const bgW = CAT.SHEET_COLS * size;
    const bgH = CAT.SHEET_ROWS * size;
    const x = -it.col * size;
    const y = -it.row * size;
    return `<span class="item-sprite${silhouette ? ' silhouette' : ''}" style="width:${size}px;height:${size}px;background-size:${bgW}px ${bgH}px;background-position:${x}px ${y}px;"></span>`;
  }

  function uiSpriteHtml(idx, size) {
    return `<span class="ui-sprite" style="width:${size}px;height:${size}px;background-size:${6 * size}px ${size}px;background-position:${-idx * size}px 0;"></span>`;
  }

  function getRavenSpriteIdx(sc) {
    if (sc.HasBogeSet && sc.HasRuiSet) return 3;
    if (sc.HasRuiSet) return 2;
    if (sc.HasBogeSet) return 1;
    return 0;
  }

  function formatCountdown(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  }

  function showToast(msg) {
    const el = document.getElementById('toastBar');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function openModal(html) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal-box">${html}</div>`;
    root.classList.remove('hidden');
  }

  function closeModal() {
    const root = document.getElementById('modalRoot');
    root.classList.add('hidden');
    root.innerHTML = '';
  }

  function confirmDialog(title, bodyHtml, confirmLabel, confirmCls, onYes) {
    openModal(`
      <h3 style="font-size:16px;margin-bottom:10px;">${esc(title)}</h3>
      <div style="font-size:13px;line-height:1.6;color:var(--ink-sub);margin-bottom:16px;">${bodyHtml}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-muted" id="dlgNo">取消</button>
        <button class="btn ${confirmCls || 'btn-coral'}" id="dlgYes">${esc(confirmLabel || '确定')}</button>
      </div>
    `);
    document.getElementById('dlgNo').onclick = closeModal;
    document.getElementById('dlgYes').onclick = () => { closeModal(); if (onYes) onYes(); };
  }

  function compareOwned(a, b) {
    const e = (b.EnhanceLevel || 0) - (a.EnhanceLevel || 0);
    if (e !== 0) return e;
    const da = CAT.ITEM_BY_ID[a.ItemId];
    const db = CAT.ITEM_BY_ID[b.ItemId];
    const r = (db ? db.rarity : -1) - (da ? da.rarity : -1);
    return r !== 0 ? r : ((db ? db.price : 0) - (da ? da.price : 0));
  }

  // ==================== 顶栏与底栏状态刷新 ====================
  function updateChrome() {
    const d = engine.data;
    const sc = engine.evaluateShowcase();
    document.body.classList.toggle('polar-snow', sc.HasPolarEasterEgg);

    document.getElementById('pillCoins').textContent = `🪙 ${d.Coins.toLocaleString()}`;
    document.getElementById('pillSlips').textContent = `🧾 ${d.ReimbursementSlipCount}单`;

    const btnNotice = document.getElementById('btnNotice');
    btnNotice.classList.toggle('unread', engine.hasUnseenNotice());

    const bBoxes = document.getElementById('badgeBoxes');
    const boxCnt = d.PendingBoxes.length;
    bBoxes.textContent = boxCnt > 99 ? '99+' : String(boxCnt);
    bBoxes.classList.toggle('hidden', boxCnt === 0);

    const bBag = document.getElementById('badgeBag');
    const bagCnt = d.ForgedItems.length + d.Inventory.reduce((s, x) => s + x.Count, 0);
    bBag.textContent = bagCnt > 99 ? '99+' : String(bagCnt);
    bBag.classList.toggle('hidden', bagCnt === 0);

    document.querySelectorAll('#tabBar .tab-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === ui.tab);
    });
  }

  function render() {
    updateChrome();
    const main = document.getElementById('mainView');
    if (ui.tab === 'gifts') renderGifts(main);
    else if (ui.tab === 'warehouse') renderWarehouse(main);
    else if (ui.tab === 'shop') renderShopOrSlot(main);
    else if (ui.tab === 'forge') renderForgeOrSynth(main);
    else if (ui.tab === 'showcase') renderShowcaseOrCodex(main);
  }

  // ==================== Tab 1: 礼盒 + 离线巡逻 + 渡鸦互动 + 走路掉盒 ====================
  function renderGifts(main) {
    const d = engine.data;
    const sc = engine.evaluateShowcase();
    const boxes = d.PendingBoxes.slice().sort((a, b) => b.RarityValue - a.RarityValue);
    let sel = boxes.find((b) => b.Id === ui.selectedBoxId) || boxes[0] || null;
    ui.selectedBoxId = sel ? sel.Id : null;

    const ravenIdx = getRavenSpriteIdx(sc);
    const patrolCd = formatCountdown(engine.getPatrolRemainingMs());
    const walkOn = pedometer.active;
    const stepsProg = `${engine.stepBuffer}/${ENG.STEPS_PER_ROLL}`;

    let boxSectionHtml = '';
    if (!sel) {
      boxSectionHtml = `
        <div class="card" style="text-align:center;padding:18px 12px;">
          <div style="font-size:15px;font-weight:800;margin-bottom:6px;">当前没有待开启的礼盒</div>
          <div style="font-size:12px;color:var(--ink-sub);line-height:1.6;">
            把网页切到后台或添加到主屏幕，渡鸦每 <b>5 分钟</b> 会自动离线巡逻衔回礼盒；<br/>也可以点击上方小渡鸦互动，或开启「走路掉盒」出门散步！
          </div>
        </div>`;
    } else {
      const m = ENG.getMeta(sel.RarityValue);
      const cabMode = sc.HasCabbageSet;
      boxSectionHtml = `
        <div class="card box-hero" style="background:${m.cardBg};border-color:${m.border};color:${m.dark ? m.badgeText : 'var(--ink)'};">
          <div style="font-size:12px;font-weight:800;padding:2px 10px;border-radius:999px;background:${m.badgeBg};color:${m.badgeText};">
            ${cabMode ? '🥬 卷心菜·' : ''}${m.colorName} · ${m.label}礼盒（队列共 ${boxes.length} 个）
          </div>
          <div class="gift-visual" id="heroGiftBox" style="background:${m.boxBody};border-color:${m.border};">
            <div class="gift-ribbon-v" style="background:${m.boxRibbon};"></div>
            <div class="gift-ribbon-h" style="background:${m.boxRibbon};"></div>
            <div class="gift-bow">${cabMode ? '🥬' : '🎀'}</div>
          </div>
          <div style="font-size:11.5px;opacity:0.85;margin-bottom:10px;">
            来源：${esc(sel.Source)} · ${esc(sel.DroppedAt)}
          </div>
          <div style="display:flex;gap:8px;width:100%;">
            <button class="btn btn-leaf" style="flex:1.4;" id="btnOpenOne">拆开这个礼盒</button>
            <button class="btn btn-gold" style="flex:1;" id="btnOpenAll">一键全开 (${boxes.length})</button>
          </div>
        </div>
        <div class="card" style="padding:10px;">
          <div style="font-size:12px;font-weight:800;margin-bottom:6px;">待开启礼盒队列（点击切换）</div>
          <div class="box-queue">
            ${boxes.slice(0, 30).map((b) => {
              const bm = ENG.getMeta(b.RarityValue);
              const isSel = b.Id === sel.Id;
              return `<div class="box-chip${isSel ? ' selected' : ''}" data-box-id="${b.Id}" style="background:${bm.cardBg};border-color:${isSel ? 'var(--wood)' : bm.border};color:${bm.dark ? bm.badgeText : 'var(--ink)'};">
                <div style="font-size:20px;">${cabMode ? '🥬' : '🎁'}</div>
                <div>${bm.colorName}·${bm.label}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    main.innerHTML = `
      <div class="card raven-stage">
        <div style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
          <span style="font-size:13px;font-weight:800;">🐦 渡鸦巡逻站</span>
          <span style="font-size:11px;font-weight:800;color:var(--leaf-dark);">仿真战力 ${sc.TotalPower.toLocaleString()}</span>
        </div>
        <div class="raven-tap-zone" id="ravenTapBtn" title="点我互动">${uiSpriteHtml(ravenIdx, 82)}</div>
        <div class="speech-bubble" id="ravenBubble">${esc(ui.ravenBubble)}</div>
        <div class="patrol-grid">
          <div class="mini-stat">
            <div class="k">⏳ 离线巡逻倒计时 (每5分)</div>
            <div class="v" id="livePatrolCd">${patrolCd}</div>
          </div>
          <div class="mini-stat">
            <div class="k">📊 累计互动 / 掉盒</div>
            <div class="v">${d.TotalInteractions} 次 / ${d.TotalBoxesDropped} 盒</div>
          </div>
        </div>
        <div class="walk-bar${walkOn ? '' : ' off'}">
          <div style="text-align:left;">
            <div style="font-size:12.5px;font-weight:800;">🚶 走路掉礼盒（iOS / 安卓统一标准）</div>
            <div style="font-size:11px;color:var(--ink-sub);" id="liveStepStat">
              ${walkOn ? `计步中！本轮进度 ${stepsProg} 步 · 累计 ${d.MobileTotalSteps} 步` : `未开启 · 累计 ${d.MobileTotalSteps} 步（每满20步判定掉盒）`}
            </div>
          </div>
          <button class="btn btn-sm ${walkOn ? 'btn-coral' : 'btn-leaf'}" id="btnToggleWalk">${walkOn ? '停止计步' : '开启走路'}</button>
        </div>
      </div>
      ${boxSectionHtml}
    `;

    document.getElementById('ravenTapBtn').onclick = () => {
      const zone = document.getElementById('ravenTapBtn');
      zone.classList.remove('hop');
      void zone.offsetWidth;
      zone.classList.add('hop');
      const res = engine.interactWithRaven();
      ui.ravenBubble = res.bubble;
      const bEl = document.getElementById('ravenBubble');
      if (bEl) bEl.textContent = res.bubble;
      if (res.dropped) {
        const m = ENG.getMeta(res.dropped.RarityValue);
        if (engine.data.Settings.EnableSound) audio.playDrop(res.dropped.RarityValue, sc.HasLaoBing2, sc.HasRuiSet, res.isDouble);
        showToast(`🎁 互动掉落 [${m.colorName}·${m.label}] 礼盒${res.isDouble ? ' ×2 (伯格双倍!)' : ''}！`);
        render();
      } else if (engine.data.Settings.EnableSound) {
        audio.playTap();
      }
    };

    document.getElementById('btnToggleWalk').onclick = async () => {
      const r = await pedometer.toggle();
      showToast(r.message);
      render();
    };

    if (sel) {
      const openFn = () => {
        const boxEl = document.getElementById('heroGiftBox');
        if (boxEl) boxEl.classList.add('shake');
        setTimeout(() => {
          const res = engine.openBox(sel.Id);
          if (!res) return;
          const scNow = engine.evaluateShowcase();
          if (engine.data.Settings.EnableSound) audio.playOpen(res.item.rarity, scNow.HasHaoSet, scNow.HasRuiSet);
          showItemRevealModal(res.item, 0, true, res.isNew, res.isUpgraded, null, () => {
            if (res.ruiDouble && res.bonusItem) {
              showItemRevealModal(res.bonusItem, 0, true, res.bonusIsNew, false, null, null, '★ 睿套双倍附赠');
            }
          });
          if (res.shopRefreshed) showToast('已满 50 盒，商店货架已自动更新！');
          render();
        }, 220);
      };
      document.getElementById('heroGiftBox').onclick = openFn;
      document.getElementById('btnOpenOne').onclick = openFn;
      document.getElementById('btnOpenAll').onclick = () => {
        const list = engine.openAllBoxes();
        if (list.length === 0) return;
        const scNow = engine.evaluateShowcase();
        let best = 0, newCnt = 0, bonusCnt = 0;
        const flat = [];
        list.forEach((r) => {
          if (r.item.rarity > best) best = r.item.rarity;
          if (r.isNew) newCnt++;
          flat.push({ item: r.item, isNew: r.isNew, rui: false });
          if (r.ruiDouble && r.bonusItem) {
            bonusCnt++;
            if (r.bonusItem.rarity > best) best = r.bonusItem.rarity;
            if (r.bonusIsNew) newCnt++;
            flat.push({ item: r.bonusItem, isNew: r.bonusIsNew, rui: true });
          }
        });
        if (engine.data.Settings.EnableSound) audio.playOpen(best, scNow.HasHaoSet, scNow.HasRuiSet);
        flat.sort((a, b) => b.item.rarity - a.item.rarity || b.item.price - a.item.price);
        openModal(`
          <h3 style="font-size:16px;margin-bottom:6px;">🎁 一键拆盒收获清单</h3>
          <div style="font-size:12.5px;color:var(--ink-sub);margin-bottom:10px;">
            共拆开 <b>${list.length}</b> 个礼盒，收获 <b>${flat.length}</b> 件藏品${bonusCnt ? `（含睿套双倍 +${bonusCnt}）` : ''}，新收录图鉴 <b>${newCnt}</b> 件！
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto;margin-bottom:12px;">
            ${flat.slice(0, 24).map((x) => {
              const m = ENG.getMeta(x.item.rarity);
              return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;background:${m.cardBg};border:1.5px solid ${m.border};color:${m.dark ? m.badgeText : 'var(--ink)'};">
                ${itemSpriteHtml(x.item.id, 34, false)}
                <div style="flex:1;min-width:0;">
                  <div style="font-size:12.5px;font-weight:800;">${esc(x.item.name)} ${x.isNew ? '<span style="color:#D96055;">★新</span>' : ''}${x.rui ? ' [睿双倍]' : ''}</div>
                  <div style="font-size:11px;opacity:0.8;">${m.colorName}·${m.label} · ${x.item.price} 币</div>
                </div>
              </div>`;
            }).join('')}
            ${flat.length > 24 ? `<div style="text-align:center;font-size:12px;color:var(--ink-sub);">……其余 ${flat.length - 24} 件已存入仓库</div>` : ''}
          </div>
          <button class="btn btn-leaf" style="width:100%;" id="btnCloseBulk">全部收入仓库</button>
        `);
        document.getElementById('btnCloseBulk').onclick = closeModal;
        render();
      };
      main.querySelectorAll('.box-chip').forEach((ch) => {
        ch.onclick = () => { ui.selectedBoxId = ch.dataset.boxId; render(); };
      });
    }
  }

  function updatePatrolAndStepLive() {
    const cdEl = document.getElementById('livePatrolCd');
    if (cdEl) cdEl.textContent = formatCountdown(engine.getPatrolRemainingMs());
    const stEl = document.getElementById('liveStepStat');
    if (stEl) {
      stEl.textContent = pedometer.active
        ? `计步中！本轮进度 ${engine.stepBuffer}/${ENG.STEPS_PER_ROLL} 步 · 累计 ${engine.data.MobileTotalSteps} 步`
        : `未开启 · 累计 ${engine.data.MobileTotalSteps} 步（每满20步判定掉盒）`;
    }
  }

  // ==================== Tab 2: 仓库（售卖 + 分解报销单 + 放入收藏室） ====================
  function renderWarehouse(main) {
    const raw = engine.getOwnedItems().filter((x) => {
      const it = CAT.ITEM_BY_ID[x.ItemId];
      return it && (ui.whFilter < 0 || it.rarity === ui.whFilter);
    }).sort(compareOwned);

    main.innerHTML = `
      <div class="card" style="padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:800;">🎒 仓库藏品 (${raw.length})</span>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-xs btn-dis" id="btnDisCom">分解白/绿</button>
            <button class="btn btn-xs btn-gold" id="btnSellDup">卖重复</button>
          </div>
        </div>
        ${renderRarityFilters(ui.whFilter, 'wh')}
      </div>
      ${raw.length === 0
        ? `<div class="card" style="text-align:center;padding:28px 12px;color:var(--ink-sub);font-size:13px;">仓库里暂无这类藏品，去拆礼盒或逛商店吧～</div>`
        : `<div class="item-grid">${raw.map((slot) => {
            const it = CAT.ITEM_BY_ID[slot.ItemId];
            const m = ENG.getMeta(it.rarity);
            const sellVal = engine.getEffectiveSellUnitPrice(it, slot.EnhanceLevel);
            const slips = ENG.getDisassembleSlips(it.rarity, slot.EnhanceLevel);
            const setLbl = ENG.getRoleSetLabelForItem(it.id);
            const stars = ENG.getStarBadge(slot.EnhanceLevel);
            const rightTag = slot.EnhanceLevel > 0 ? `${stars}+${slot.EnhanceLevel}` : `×${slot.Count}`;
            return `<div class="item-card" style="background:${m.cardBg};border-color:${m.border};color:${m.dark ? m.badgeText : 'var(--ink)'};">
              <div class="top-row">
                <span class="tag-mini" style="background:${m.badgeBg};color:${m.badgeText};">${m.label}</span>
                <span class="tag-mini" style="background:${slot.EnhanceLevel > 0 ? 'var(--gold)' : 'var(--raven)'};color:${slot.EnhanceLevel > 0 ? '#3B2D23' : '#fff'};">${rightTag}</span>
              </div>
              <div class="wh-inspect" data-id="${it.id}" data-lv="${slot.EnhanceLevel}" style="cursor:pointer;">${itemSpriteHtml(it.id, 54, false)}</div>
              <div class="item-name">${esc(it.name)}${slot.EnhanceLevel > 0 ? ` +${slot.EnhanceLevel}` : ''}</div>
              <div class="item-sub" style="color:${setLbl ? (m.dark ? '#E4BAFF' : '#743EB2') : 'inherit'};">
                ${setLbl ? `✦ ${esc(setLbl.split(' / ')[0])}` : (slot.EnhanceLevel > 0 ? `战力 ${ENG.getEnhancedValue(it, slot.EnhanceLevel)}` : esc(it.subtitle))}
              </div>
              <div class="card-btns">
                <button class="btn btn-xs btn-gold wh-sell" data-uid="${slot.Uid || ''}" data-id="${it.id}" data-lv="${slot.EnhanceLevel}">卖+${sellVal}</button>
                <button class="btn btn-xs btn-dis wh-dis" data-uid="${slot.Uid || ''}" data-id="${it.id}" data-lv="${slot.EnhanceLevel}">拆+${slips}单</button>
                <button class="btn btn-xs btn-leaf wh-put" data-uid="${slot.Uid || ''}" data-id="${it.id}">收藏</button>
              </div>
            </div>`;
          }).join('')}</div>`}
    `;

    bindRarityFilters(main, 'wh', (val) => { ui.whFilter = val; render(); });

    document.getElementById('btnDisCom').onclick = () => {
      confirmDialog('一键分解白/绿藏品', '将分解仓库中全部<b>白色/绿色非套装藏品</b>以换取锻造材料「报销单」（自动保护所有套装组件）。确定继续吗？', '确认分解', 'btn-coral', () => {
        const r = engine.disassembleByMaxRarity(1, true);
        if (r.slips > 0) {
          if (engine.data.Settings.EnableSound) audio.playCoin();
          showToast(`已分解 ${r.destroyed} 件，获得 +${r.slips} 张报销单！`);
        } else showToast('没有可分解的白/绿非套装藏品');
        render();
      });
    };

    document.getElementById('btnSellDup').onclick = () => {
      confirmDialog('卖掉多余重复藏品', '每种普通堆叠藏品保留 1 件，其余重复件全部售出换取仿真币（不含已强化珍品）。确定吗？', '全部售出', 'btn-gold', () => {
        const earned = engine.sellDuplicates();
        if (earned > 0) {
          if (engine.data.Settings.EnableSound) audio.playCoin();
          showToast(`已售出重复藏品，获得 +${earned} 仿真币！`);
        } else showToast('当前没有多余的重复藏品');
        render();
      });
    };

    main.querySelectorAll('.wh-inspect').forEach((el) => {
      el.onclick = () => {
        const it = CAT.ITEM_BY_ID[el.dataset.id];
        if (it) showItemRevealModal(it, Number(el.dataset.lv) || 0, false, false, false, null);
      };
    });

    main.querySelectorAll('.wh-sell').forEach((btn) => {
      btn.onclick = () => {
        const uidStr = btn.dataset.uid, id = btn.dataset.id, lv = Number(btn.dataset.lv) || 0;
        const it = CAT.ITEM_BY_ID[id];
        if (!it) return;
        const val = engine.getEffectiveSellUnitPrice(it, lv);
        const doSell = () => {
          const earned = uidStr ? engine.sellForgedItem(uidStr) : engine.sellNormalItem(id, 1);
          if (earned > 0) {
            if (engine.data.Settings.EnableSound) audio.playCoin();
            showToast(`售出「${it.name}」获得 +${earned} 仿真币！`);
          }
          render();
        };
        if (it.rarity >= 4 || lv > 0 || ENG.isRoleSetItem(id)) {
          const setLbl = ENG.getRoleSetLabelForItem(id);
          confirmDialog('珍品售卖确认',
            `藏品：<b>${esc(it.name)}${lv > 0 ? ` +${lv}` : ''}</b><br/>可获得：<b>${val} 仿真币</b>${setLbl ? `<br/><span style="color:#9C2C24;">⚠ 属于套装【${esc(setLbl)}】组件！</span>` : ''}`,
            '确定售出', 'btn-coral', doSell);
        } else doSell();
      };
    });

    main.querySelectorAll('.wh-dis').forEach((btn) => {
      btn.onclick = () => {
        const uidStr = btn.dataset.uid, id = btn.dataset.id, lv = Number(btn.dataset.lv) || 0;
        const it = CAT.ITEM_BY_ID[id];
        if (!it) return;
        const slips = ENG.getDisassembleSlips(it.rarity, lv);
        const doDis = () => {
          const r = uidStr ? engine.disassembleForgedItem(uidStr) : engine.disassembleNormalItem(id, 1);
          if (r.ok && engine.data.Settings.EnableSound) audio.playCoin();
          showToast(r.message);
          render();
        };
        if (it.rarity >= 4 || lv > 0 || ENG.isRoleSetItem(id)) {
          const setLbl = ENG.getRoleSetLabelForItem(id);
          confirmDialog('珍品分解确认',
            `将分解：<b>${esc(it.name)}${lv > 0 ? ` +${lv}` : ''}</b><br/>获得：<b>+${slips} 张报销单</b>${setLbl ? `<br/><span style="color:#9C2C24;">⚠ 属于套装【${esc(setLbl)}】组件！</span>` : ''}`,
            '确认分解', 'btn-coral', doDis);
        } else doDis();
      };
    });

    main.querySelectorAll('.wh-put').forEach((btn) => {
      btn.onclick = () => {
        const r = engine.moveToShowcase(btn.dataset.uid || null, btn.dataset.id);
        if (r.ok && engine.data.Settings.EnableSound) audio.playCoin();
        showToast(r.message);
        render();
      };
    });
  }

  // ==================== Tab 3: 商店 + 老虎机 ====================
  function renderShopOrSlot(main) {
    const subBar = `
      <div class="subtabs">
        <button class="subtab${ui.shopSub === 'shop' ? ' active' : ''}" id="subShop">🏪 神秘商店</button>
        <button class="subtab${ui.shopSub === 'slot' ? ' active' : ''}" id="subSlot">🎰 幸运老虎机</button>
      </div>`;
    if (ui.shopSub === 'shop') renderShopBody(main, subBar);
    else renderSlotBody(main, subBar);
    document.getElementById('subShop').onclick = () => { ui.shopSub = 'shop'; render(); };
    document.getElementById('subSlot').onclick = () => { ui.shopSub = 'slot'; render(); };
  }

  function renderShopBody(main, subBar) {
    const d = engine.data;
    const codexSet = {};
    d.Codex.forEach((c) => { codexSet[c.ItemId] = true; });
    const prog = d.BoxesOpenedSinceShopRefresh % ENG.SHOP_REFRESH_EVERY_BOXES;

    main.innerHTML = `${subBar}
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
          <div>
            <div style="font-size:13.5px;font-weight:800;">渡鸦神秘货架</div>
            <div style="font-size:11px;color:var(--ink-sub);">每开 50 盒自动刷新 (${prog}/50)</div>
          </div>
          <button class="btn btn-sm btn-gold" id="btnShopRef">刷新 (${ENG.SHOP_REFRESH_COST}币)</button>
        </div>
        <div class="item-grid">
          ${d.ShopOffers.map((off, idx) => {
            const it = CAT.ITEM_BY_ID[off.ItemId];
            if (!it) return '';
            const m = ENG.getMeta(it.rarity);
            const price = ENG.getShopBuyPrice(it);
            const uncol = !codexSet[it.id] && !off.Purchased;
            return `<div class="item-card" style="background:${off.Purchased ? 'var(--sub)' : m.cardBg};border-color:${off.Purchased ? 'var(--border)' : m.border};color:${m.dark && !off.Purchased ? m.badgeText : 'var(--ink)'};">
              <div class="top-row">
                <span class="tag-mini" style="background:${m.badgeBg};color:${m.badgeText};">${m.label}</span>
                ${uncol ? `<span class="tag-mini" style="background:var(--coral);color:#fff;">★未收录</span>` : ''}
              </div>
              ${itemSpriteHtml(it.id, 52, false)}
              <div class="item-name">${esc(it.name)}</div>
              <div class="item-sub">${esc(it.subtitle)}</div>
              <button class="btn btn-xs ${off.Purchased ? 'btn-muted' : (d.Coins >= price ? 'btn-leaf' : 'btn-muted')} shop-buy" style="width:100%;margin-top:8px;" data-idx="${idx}" ${off.Purchased ? 'disabled' : ''}>
                ${off.Purchased ? '已购入' : `购买 · ${price} 币`}
              </button>
            </div>`;
          }).join('')}
          <div class="item-card" style="background:${d.ShopHasDragonScale && !d.ShopDragonScalePurchased ? '#E8F8F2' : 'var(--sub)'};border-color:${d.ShopHasDragonScale && !d.ShopDragonScalePurchased ? '#38947C' : 'var(--border)'};">
            <div class="top-row">
              <span class="tag-mini" style="background:#CCEFE2;color:#1E6654;">锻造保护</span>
              <span style="font-size:10.5px;font-weight:800;color:var(--ink-sub);">持有 ${d.DragonScaleCount}</span>
            </div>
            ${uiSpriteHtml(4, 52)}
            <div class="item-name">开裂的龙鳞</div>
            <div class="item-sub">锻造失败防碎保底</div>
            <button class="btn btn-xs ${d.ShopHasDragonScale && !d.ShopDragonScalePurchased && d.Coins >= ENG.DRAGON_SCALE_PRICE ? 'btn-leaf' : 'btn-muted'}" style="width:100%;margin-top:8px;" id="btnBuyScale" ${!d.ShopHasDragonScale || d.ShopDragonScalePurchased ? 'disabled' : ''}>
              ${!d.ShopHasDragonScale ? '本轮未刷出' : (d.ShopDragonScalePurchased ? '已购入' : `购买 · ${ENG.DRAGON_SCALE_PRICE} 币`)}
            </button>
          </div>
        </div>
      </div>`;

    document.getElementById('btnShopRef').onclick = () => {
      const r = engine.manualRefreshShop();
      if (r.ok && engine.data.Settings.EnableSound) audio.playDrop(2, false, false, false);
      showToast(r.message);
      render();
    };
    main.querySelectorAll('.shop-buy').forEach((btn) => {
      btn.onclick = () => {
        const r = engine.buyShopOffer(Number(btn.dataset.idx));
        if (r.ok && engine.data.Settings.EnableSound) audio.playCoin();
        showToast(r.message);
        render();
      };
    });
    const bs = document.getElementById('btnBuyScale');
    if (bs) bs.onclick = () => {
      const r = engine.buyDragonScale();
      if (r.ok && engine.data.Settings.EnableSound) audio.playCoin();
      showToast(r.message);
      render();
    };
  }

  function renderSlotBody(main, subBar) {
    const d = engine.data;
    const sc = engine.evaluateShowcase();
    const boxes = d.PendingBoxes.slice().sort((a, b) => a.RarityValue - b.RarityValue);
    const sel = boxes.find((b) => b.Id === ui.slotBoxId) || boxes[0] || null;
    ui.slotBoxId = sel ? sel.Id : null;

    main.innerHTML = `${subBar}
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:14px;font-weight:800;">🎰 渡鸦幸运老虎机</div>
          ${sc.HasLaoBing1 ? `<span class="tag-mini" style="background:#E4F5FF;color:#1A629C;">★老冰1.0保底不空</span>` : ''}
        </div>
        <div style="font-size:11.5px;color:var(--ink-sub);margin-top:3px;">金色及以上礼盒保底出紫 · 99抽必出神话 · 199抽必出限定</div>
        <div class="slot-reels">
          ${ui.slotReels.map((id) => {
            const it = CAT.ITEM_BY_ID[id] || CAT.ITEMS[0];
            return `<div class="slot-reel">${itemSpriteHtml(it.id, 52, false)}<div class="item-name" style="margin-top:6px;">${esc(it.name)}</div></div>`;
          }).join('')}
        </div>
        <div style="text-align:center;font-size:12.5px;font-weight:800;color:var(--raven);margin-bottom:10px;">${esc(ui.slotLastMsg)}</div>
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;"><span>红色神话保底</span><span>${d.SlotPityRed}/${ENG.SLOT_PITY_RED}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, d.SlotPityRed * 100 / ENG.SLOT_PITY_RED)}%;background:#D84A48;"></div></div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;"><span>粉色限定保底</span><span>${d.SlotPityPink}/${ENG.SLOT_PITY_PINK}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, d.SlotPityPink * 100 / ENG.SLOT_PITY_PINK)}%;background:#E460A0;"></div></div>
        </div>
        <button class="btn ${sel && !ui.slotSpinning ? 'btn-coral' : 'btn-muted'}" style="width:100%;" id="btnSpinSlot" ${!sel || ui.slotSpinning ? 'disabled' : ''}>
          ${!sel ? '暂无未开封礼盒可投入' : (ui.slotSpinning ? '滚轮飞速旋转中...' : `投入 ${ENG.getMeta(sel.RarityValue).colorName}·${ENG.getMeta(sel.RarityValue).label}盒 开转！`)}
        </button>
      </div>
      <div class="card" style="padding:10px;">
        <div style="font-size:12px;font-weight:800;margin-bottom:6px;">选择要投入的礼盒（共 ${boxes.length} 个 · 累计已抽 ${d.SlotTotalSpins} 次）</div>
        ${boxes.length === 0 ? `<div style="font-size:12px;color:var(--ink-sub);text-align:center;padding:12px;">暂无礼盒，让渡鸦出去巡逻一会儿吧～</div>`
          : `<div class="box-queue">${boxes.slice(0, 24).map((b) => {
              const bm = ENG.getMeta(b.RarityValue);
              return `<div class="box-chip${sel && b.Id === sel.Id ? ' selected' : ''}" data-sbox="${b.Id}" style="background:${bm.cardBg};border-color:${sel && b.Id === sel.Id ? 'var(--wood)' : bm.border};color:${bm.dark ? bm.badgeText : 'var(--ink)'};">
                <div style="font-size:18px;">🎁</div><div>${bm.colorName}·${bm.label}</div>
              </div>`;
            }).join('')}</div>`}
      </div>`;

    main.querySelectorAll('[data-sbox]').forEach((el) => {
      el.onclick = () => { ui.slotBoxId = el.dataset.sbox; render(); };
    });
    const spinBtn = document.getElementById('btnSpinSlot');
    if (spinBtn && sel && !ui.slotSpinning) {
      spinBtn.onclick = () => {
        const res = engine.spinSlotMachine(sel.Id);
        if (!res.ok) { showToast(res.message); return; }
        ui.slotSpinning = true;
        ui.slotLastMsg = '滚轮飞速旋转中，好运降临…';
        let ticks = 0;
        const timer = setInterval(() => {
          ticks++;
          ui.slotReels = [0, 1, 2].map(() => CAT.ITEMS[Math.floor(Math.random() * (CAT.ITEMS.length - 7))].id);
          if (ticks >= 8) {
            clearInterval(timer);
            ui.slotSpinning = false;
            ui.slotReels = res.isMiss ? ['w_05', 'w_08', 'w_15'] : [res.item.id, res.item.id, res.item.id];
            ui.slotLastMsg = res.message;
            if (engine.data.Settings.EnableSound) audio.playOpen(res.isMiss ? 0 : res.item.rarity, false, false);
            showToast(res.message);
          }
          if (ui.tab === 'shop' && ui.shopSub === 'slot') render();
        }, 70);
      };
    }
  }

  // ==================== Tab 4: 锻造（报销单 + 原地强化）+ 合成台 ====================
  function renderForgeOrSynth(main) {
    const subBar = `
      <div class="subtabs">
        <button class="subtab${ui.forgeSub === 'forge' ? ' active' : ''}" id="subForge">🔨 渡鸦锻造炉</button>
        <button class="subtab${ui.forgeSub === 'synth' ? ' active' : ''}" id="subSynth">✨ 三合一合成</button>
      </div>`;
    if (ui.forgeSub === 'forge') renderForgeBody(main, subBar);
    else renderSynthBody(main, subBar);
    document.getElementById('subForge').onclick = () => { ui.forgeSub = 'forge'; render(); };
    document.getElementById('subSynth').onclick = () => { ui.forgeSub = 'synth'; render(); };
  }

  function renderForgeBody(main, subBar) {
    const d = engine.data;
    const sc = engine.evaluateShowcase();
    const list = engine.getAllForgeableItems().sort((a, b) => (a.IsShowcaseEntry !== b.IsShowcaseEntry ? (a.IsShowcaseEntry ? -1 : 1) : compareOwned(a, b)));
    let target = list.find((x) => ui.forgeUid && x.Uid === ui.forgeUid && x.IsShowcaseEntry === ui.forgeIsShowcase)
      || list.find((x) => !ui.forgeUid && !x.Uid && x.ItemId === ui.forgeItemId)
      || list[0] || null;
    if (target) {
      ui.forgeUid = target.Uid;
      ui.forgeItemId = target.ItemId;
      ui.forgeIsShowcase = target.IsShowcaseEntry;
    }

    let stageHtml = `<div class="card" style="text-align:center;color:var(--ink-sub);padding:20px;">暂无可锻造物品，先拆礼盒收集吧～</div>`;
    if (target) {
      const def = CAT.ITEM_BY_ID[target.ItemId];
      const m = ENG.getMeta(def.rarity);
      const curLv = target.EnhanceLevel || 0;
      const nextLv = curLv + 1;
      const slipCost = ENG.getForgeSlipCost(def.rarity, curLv);
      const enough = d.ReimbursementSlipCount >= slipCost;
      const chance = engine.getEffectiveForgeChance(curLv, target.BogeSuccessStacks || 0);
      const chenFree = sc.HasChenSet && !target.ChenFreeShieldUsed;
      const scaleRem = Math.max(0, ENG.MAX_DRAGON_SCALES_PER_ITEM - (target.DragonScaleShieldsUsed || 0));
      const willAscend = nextLv >= 8 && def.rarity < 7;

      stageHtml = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;">
            <span class="res-pill slip" style="font-size:11.5px;">${uiSpriteHtml(5, 16)} 报销单：${d.ReimbursementSlipCount} 张</span>
            <span class="res-pill" style="font-size:11.5px;background:#E8F8F2;border-color:#38947C;color:#1E6654;">${uiSpriteHtml(4, 16)} 龙鳞：${d.DragonScaleCount} 片</span>
          </div>
          <div style="display:flex;gap:12px;align-items:center;padding:10px;border-radius:14px;background:${m.cardBg};border:2px solid ${target.IsShowcaseEntry ? '#945CD4' : m.border};color:${m.dark ? m.badgeText : 'var(--ink)'};">
            ${itemSpriteHtml(def.id, 64, false)}
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:800;">
                ${target.IsShowcaseEntry ? '<span class="tag-mini" style="background:#8456CC;color:#fff;margin-right:4px;">展柜</span>' : ''}${esc(def.name)} +${curLv} ${ENG.getStarBadge(curLv)}
              </div>
              <div style="font-size:12px;margin-top:3px;">
                ${willAscend ? `★ +8 飞升为【${ENG.getMeta(def.rarity + 1).label}】随机品！` : `收藏室战力估值：${ENG.getEnhancedValue(def, curLv)} → <b>${ENG.getEnhancedValue(def, nextLv)}</b>`}
              </div>
              <div style="font-size:12.5px;font-weight:800;margin-top:3px;color:${chance >= 50 ? 'var(--leaf-dark)' : 'var(--coral)'};">
                成功率：${chance.toFixed(1)}% · 消耗报销单 ×${slipCost} 张
              </div>
            </div>
          </div>
          <div style="margin-top:8px;padding:8px 10px;border-radius:11px;font-size:12px;font-weight:700;cursor:pointer;background:${chenFree ? '#F2EAFE' : (ui.forgeUseScale && d.DragonScaleCount > 0 && scaleRem > 0 ? '#E8F8F2' : '#FEECEB')};border:1.5px solid ${chenFree ? '#846CE0' : (ui.forgeUseScale && d.DragonScaleCount > 0 && scaleRem > 0 ? '#38947C' : 'var(--coral)')};" id="btnToggleScale">
            ${chenFree ? `★ 宸套免费防碎保护生效中（不扣龙鳞 · 龙鳞余 ${scaleRem}/3）`
              : (scaleRem <= 0 ? '⚠ 本件龙鳞保护次数已用尽 (3/3)，失败将直接碎裂！'
                : (d.DragonScaleCount > 0 ? (ui.forgeUseScale ? `☑ 已启用「开裂的龙鳞」防碎保护（本件余 ${scaleRem}/3）` : `☐ 点击启用龙鳞保护（不勾选失败将碎裂！）`)
                  : `⚠ 暂无龙鳞（商店300币），本次无保护失败将碎裂！`))}
          </div>
          ${ui.forgeBanner ? `<div style="margin-top:7px;font-size:12px;font-weight:800;color:var(--raven);">${esc(ui.forgeBanner)}</div>` : ''}
          <button class="btn ${enough ? 'btn-coral' : 'btn-muted'}" style="width:100%;margin-top:10px;" id="btnExecForge">
            ${target.IsShowcaseEntry ? `原地强化 (+${curLv}→+${nextLv} · 耗${slipCost}单)` : `立即锻造 (+${curLv}→+${nextLv} · 耗${slipCost}单)`}
          </button>
        </div>`;
    }

    main.innerHTML = `${subBar}${stageHtml}
      <div class="item-grid">
        ${list.map((ov) => {
          const it = CAT.ITEM_BY_ID[ov.ItemId];
          const m = ENG.getMeta(it.rarity);
          const isSel = target && target.ItemId === ov.ItemId && (target.Uid || '') === (ov.Uid || '') && target.IsShowcaseEntry === ov.IsShowcaseEntry;
          return `<div class="item-card forge-pick" data-uid="${ov.Uid || ''}" data-id="${it.id}" data-sc="${ov.IsShowcaseEntry ? '1' : '0'}" style="cursor:pointer;background:${m.cardBg};border-color:${isSel ? 'var(--coral)' : (ov.IsShowcaseEntry ? '#945CD4' : m.border)};color:${m.dark ? m.badgeText : 'var(--ink)'};">
            <div class="top-row">
              <span class="tag-mini" style="background:${ov.IsShowcaseEntry ? '#8456CC' : m.badgeBg};color:${ov.IsShowcaseEntry ? '#fff' : m.badgeText};">${ov.IsShowcaseEntry ? '展柜' : m.label}</span>
              <span class="tag-mini" style="background:${ov.EnhanceLevel > 0 ? 'var(--gold)' : 'var(--raven)'};color:${ov.EnhanceLevel > 0 ? '#3B2D23' : '#fff'};">${ov.EnhanceLevel > 0 ? `+${ov.EnhanceLevel}` : (ov.IsShowcaseEntry ? '+0' : `×${ov.Count}`)}</span>
            </div>
            ${itemSpriteHtml(it.id, 46, false)}
            <div class="item-name">${esc(it.name)}</div>
            <div class="item-sub">耗${ENG.getForgeSlipCost(it.rarity, ov.EnhanceLevel)}单 · 战力${ENG.getEnhancedValue(it, ov.EnhanceLevel)}</div>
          </div>`;
        }).join('')}
      </div>`;

    const tg = document.getElementById('btnToggleScale');
    if (tg) tg.onclick = () => { ui.forgeUseScale = !ui.forgeUseScale; render(); };

    const ex = document.getElementById('btnExecForge');
    if (ex && target) {
      ex.onclick = () => {
        if (target.IsShowcaseEntry) {
          confirmShowcaseInPlaceForge(target.Uid, () => render());
        } else {
          runForgeAndNotify(target.Uid, target.ItemId, false);
        }
      };
    }

    main.querySelectorAll('.forge-pick').forEach((el) => {
      el.onclick = () => {
        ui.forgeUid = el.dataset.uid || null;
        ui.forgeItemId = el.dataset.id;
        ui.forgeIsShowcase = el.dataset.sc === '1';
        ui.forgeBanner = '';
        render();
      };
    });
  }

  function runForgeAndNotify(uidStr, itemId, isShowcase) {
    const res = engine.forgeItem(uidStr, itemId, isShowcase, ui.forgeUseScale);
    if (!res.executed) { showToast(res.message); return; }
    ui.forgeBanner = res.message;
    if (res.destroyed || res.ascended) {
      ui.forgeUid = null; ui.forgeIsShowcase = false;
      ui.forgeItemId = res.ascendedItem ? res.ascendedItem.id : null;
    } else if (res.resultUid) {
      ui.forgeUid = res.resultUid; ui.forgeIsShowcase = isShowcase;
    }
    if (engine.data.Settings.EnableSound) {
      if (res.ascended && res.ascendedItem) audio.playOpen(res.ascendedItem.rarity, false, false);
      else audio.playForge(res.succeeded, res.shielded);
    }
    showToast(res.message);
    if (res.ascended && res.ascendedItem) {
      showItemRevealModal(res.ascendedItem, 0, true, res.isNew, true, null);
    }
    render();
  }

  // 收藏室/套装原地强化防误点确认弹窗
  function confirmShowcaseInPlaceForge(entryUid, onDone) {
    const sc = engine.evaluateShowcase();
    const ev = sc.Items.find((x) => x.Entry.Uid === entryUid);
    if (!ev) { showToast('收藏室中未找到该藏品'); return; }
    const curLv = ev.Entry.EnhanceLevel || 0;
    const slipCost = ENG.getForgeSlipCost(ev.Def.rarity, curLv);
    if (engine.data.ReimbursementSlipCount < slipCost) {
      showToast(`报销单不足！需要 ${slipCost} 张（当前 ${engine.data.ReimbursementSlipCount} 张），请去仓库分解获取。`);
      return;
    }
    const chance = engine.getEffectiveForgeChance(curLv, ev.Entry.BogeSuccessStacks || 0);
    const chenFree = sc.HasChenSet && !ev.Entry.ChenFreeShieldUsed;
    const scaleRem = Math.max(0, ENG.MAX_DRAGON_SCALES_PER_ITEM - (ev.Entry.DragonScaleShieldsUsed || 0));
    const useScale = !chenFree && ui.forgeUseScale && engine.data.DragonScaleCount > 0 && scaleRem > 0;
    const shieldTxt = chenFree ? '★ 宸套免费保护生效（不碎、不扣龙鳞）'
      : (useScale ? `已启用「开裂的龙鳞」保底（本件余 ${scaleRem}/3 次）` : '<span style="color:#C8322C;">⚠ 当前无防碎保护，失败将直接碎裂丢失！</span>');
    const setLbl = ENG.getRoleSetLabelForItem(ev.Def.id);
    const body = `
      该物品正陈列在 <b>【${ev.IsSetItem ? '套装展位' : '自由收藏室'}】</b> 中（尚未取出）：<br/><br/>
      · 藏品：<b>${esc(ev.Def.name)} (+${curLv})</b><br/>
      · 目标：<b>+${curLv} → +${curLv + 1}</b>（成功率 <b>${chance.toFixed(1)}%</b>）<br/>
      · 消耗：<b>报销单 ×${slipCost} 张</b>（当前 ${engine.data.ReimbursementSlipCount} 张）<br/>
      · 保护：${shieldTxt}
      ${setLbl ? `<br/><br/><span style="color:#9C2C24;">⚠ 防误点提醒：该物品属于【${esc(setLbl)}】，若升阶或碎裂将导致套装效果暂时失效！</span>` : ''}
    `;
    confirmDialog('收藏室原地强化确认（防误点）', body, '确认原地强化', 'btn-coral', () => {
      runForgeAndNotify(entryUid, ev.Def.id, true);
      if (onDone) onDone();
    });
  }

  function renderSynthBody(main, subBar) {
    const used = {};
    ui.synthSlots.forEach((id) => { used[id] = (used[id] || 0) + 1; });
    const slotTier = ui.synthSlots.length > 0 && CAT.ITEM_BY_ID[ui.synthSlots[0]] ? CAT.ITEM_BY_ID[ui.synthSlots[0]].rarity : null;
    const allSame = ui.synthSlots.length === 3 && ui.synthSlots[0] === ui.synthSlots[1] && ui.synthSlots[1] === ui.synthSlots[2];
    const isTwoStar = slotTier !== null && slotTier >= 4 && allSame;
    const ready = ui.synthSlots.length === 3 && (isTwoStar || (slotTier !== null && slotTier < 7));

    const mats = engine.data.Inventory.map((s) => {
      const rem = s.Count - (used[s.ItemId] || 0);
      return { ItemId: s.ItemId, Count: rem };
    }).filter((s) => {
      const it = CAT.ITEM_BY_ID[s.ItemId];
      if (!it || s.Count <= 0) return false;
      if (ui.synthFilter >= 0 && it.rarity !== ui.synthFilter) return false;
      if (slotTier !== null && it.rarity !== slotTier) return false;
      return true;
    }).sort((a, b) => CAT.ITEM_BY_ID[a.ItemId].rarity - CAT.ITEM_BY_ID[b.ItemId].rarity);

    main.innerHTML = `${subBar}
      <div class="card">
        <div style="font-size:13px;font-weight:800;margin-bottom:4px;">三合一合成台</div>
        <div style="font-size:11.5px;color:var(--ink-sub);margin-bottom:10px;">金色以下 3 件随机合高 1 阶；金色及以上 3 件相同直合 2 星 (+3)！</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">
          ${[0, 1, 2].map((i) => {
            const id = ui.synthSlots[i];
            const it = id ? CAT.ITEM_BY_ID[id] : null;
            if (!it) return `<div class="set-slot" style="min-height:76px;justify-content:center;color:var(--ink-sub);font-size:11.5px;">材料 ${i + 1}</div>`;
            const m = ENG.getMeta(it.rarity);
            return `<div class="set-slot syn-rem" data-i="${i}" style="cursor:pointer;background:${m.cardBg};border-color:${m.border};">
              ${itemSpriteHtml(it.id, 42, false)}<div class="item-name">${esc(it.name)}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm ${ready ? 'btn-leaf' : 'btn-muted'}" style="flex:1.4;" id="btnSynGo" ${ready ? '' : 'disabled'}>${isTwoStar ? '合成 2 星 ★★' : '开始合成'}</button>
          <button class="btn btn-sm btn-gold" id="btnSynAuto">自动选3件</button>
          <button class="btn btn-sm btn-muted" id="btnSynClr">清空</button>
        </div>
      </div>
      <div class="card" style="padding:10px;">${renderRarityFilters(ui.synthFilter, 'syn')}</div>
      <div class="item-grid">
        ${mats.map((s) => {
          const it = CAT.ITEM_BY_ID[s.ItemId];
          const m = ENG.getMeta(it.rarity);
          return `<div class="item-card syn-add" data-id="${it.id}" style="cursor:pointer;background:${m.cardBg};border-color:${m.border};color:${m.dark ? m.badgeText : 'var(--ink)'};">
            <div class="top-row"><span class="tag-mini" style="background:${m.badgeBg};color:${m.badgeText};">${m.label}</span><span style="font-size:11px;font-weight:800;">剩 ${s.Count}</span></div>
            ${itemSpriteHtml(it.id, 46, false)}
            <div class="item-name">${esc(it.name)}</div>
          </div>`;
        }).join('')}
      </div>`;

    bindRarityFilters(main, 'syn', (val) => { ui.synthFilter = val; render(); });
    main.querySelectorAll('.syn-rem').forEach((el) => { el.onclick = () => { ui.synthSlots.splice(Number(el.dataset.i), 1); render(); }; });
    main.querySelectorAll('.syn-add').forEach((el) => { el.onclick = () => { if (ui.synthSlots.length < 3) { ui.synthSlots.push(el.dataset.id); render(); } }; });
    document.getElementById('btnSynClr').onclick = () => { ui.synthSlots = []; render(); };
    document.getElementById('btnSynAuto').onclick = () => {
      ui.synthSlots = [];
      for (let r = 0; r < 7; r++) {
        if (ui.synthFilter >= 0 && ui.synthFilter !== r) continue;
        const pick = [];
        for (const s of engine.data.Inventory) {
          const d = CAT.ITEM_BY_ID[s.ItemId];
          if (!d || d.rarity !== r) continue;
          const take = Math.min(s.Count, 3 - pick.length);
          for (let k = 0; k < take; k++) pick.push(d.id);
          if (pick.length === 3) break;
        }
        if (pick.length === 3) { ui.synthSlots = pick; render(); return; }
      }
      showToast('没有凑满 3 件的同品质材料');
    };
    document.getElementById('btnSynGo').onclick = () => {
      const r = engine.synthesize(ui.synthSlots.slice());
      if (!r.ok) { showToast(r.message); return; }
      ui.synthSlots = [];
      if (engine.data.Settings.EnableSound) audio.playOpen(r.item.rarity, false, false);
      showItemRevealModal(r.item, r.enhanceLevel, !r.isTwoStar, r.isNew, true, null);
      render();
    };
  }

  // ==================== Tab 5: 收藏室（分开计数 + 原地强化）+ 博物图鉴 ====================
  function renderShowcaseOrCodex(main) {
    const sc = engine.evaluateShowcase();
    const activeSets = [sc.HasLaoBing1, sc.HasLaoBing2, sc.HasHaoSet, sc.HasChenSet, sc.HasBogeSet, sc.HasRuiSet, sc.HasCabbageSet, sc.HasGoldSet].filter(Boolean).length;
    const subBar = `
      <div class="subtabs">
        <button class="subtab${ui.showcaseSub === 'cabinet' ? ' active' : ''}" data-scsub="cabinet">展柜(${sc.NormalItemCount}/36)</button>
        <button class="subtab${ui.showcaseSub === 'sets' ? ' active' : ''}" data-scsub="sets">套装(${activeSets}/8)</button>
        <button class="subtab${ui.showcaseSub === 'pick' ? ' active' : ''}" data-scsub="pick">+放入</button>
        <button class="subtab${ui.showcaseSub === 'codex' ? ' active' : ''}" data-scsub="codex">图鉴(${engine.data.Codex.length}/${CAT.ITEMS.length})</button>
      </div>`;

    if (ui.showcaseSub === 'codex') {
      renderCodexBody(main, subBar);
    } else {
      const head = `
        <div class="card${sc.HasGoldSet ? ' gold-palace' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-size:12px;font-weight:800;color:var(--ink-sub);">${sc.HasGoldSet ? '✦ 黄金殿堂总仿真战力' : '收藏室总仿真战力'}</span>
            <span style="font-size:22px;font-weight:900;color:#C6780C;">${sc.TotalPower.toLocaleString()}</span>
          </div>
          <div style="font-size:11.5px;font-weight:800;color:#744A22;margin-top:4px;">
            独立容量：自由藏品 ${sc.NormalItemCount}/${ENG.MAX_NORMAL_SHOWCASE} · 套装藏品 ${sc.SetItemCount}/${ENG.MAX_SET_SHOWCASE}
          </div>
          <div style="font-size:11px;color:var(--ink-sub);margin-top:4px;">
            ${sc.ActiveSynergyTags.length > 0 ? sc.ActiveSynergyTags.join(' · ') : '已放入藏品无需取出即可直接原地强化（操作前弹窗防误点）！'}
          </div>
        </div>`;

      if (ui.showcaseSub === 'cabinet') renderCabinetBody(main, subBar + head, sc);
      else if (ui.showcaseSub === 'sets') renderSetsBody(main, subBar + head, sc);
      else renderShowcasePickBody(main, subBar + head);
    }

    main.querySelectorAll('[data-scsub]').forEach((b) => {
      b.onclick = () => { ui.showcaseSub = b.dataset.scsub; render(); };
    });
  }

  function renderCabinetBody(main, topHtml, sc) {
    main.innerHTML = `${topHtml}
      ${sc.Items.length === 0
        ? `<div class="card" style="text-align:center;padding:26px 12px;color:var(--ink-sub);font-size:13px;">收藏室还是空的，点上方「套装」查看配方或「+放入」陈列珍宝！</div>`
        : `<div class="item-grid">${sc.Items.map((ev) => {
            const m = ENG.getMeta(ev.Def.rarity);
            return `<div class="item-card" style="background:${m.cardBg};border-color:${m.border};color:${m.dark ? m.badgeText : 'var(--ink)'};">
              <div class="top-row">
                <span class="tag-mini" style="background:${ev.IsSetItem ? '#8456CC' : 'var(--sub)'};color:${ev.IsSetItem ? '#fff' : 'var(--ink-sub)'};">${ev.IsSetItem ? '套装' : '自由'}</span>
                <span class="tag-mini" style="background:${ev.Entry.EnhanceLevel > 0 ? 'var(--gold)' : m.badgeBg};color:${ev.Entry.EnhanceLevel > 0 ? '#3B2D23' : m.badgeText};">${ev.Entry.EnhanceLevel > 0 ? `${ENG.getStarBadge(ev.Entry.EnhanceLevel)}+${ev.Entry.EnhanceLevel}` : m.label}</span>
              </div>
              ${itemSpriteHtml(ev.Def.id, 52, false)}
              <div class="item-name">${esc(ev.Def.name)}</div>
              <div class="item-sub" style="font-weight:800;color:${m.dark ? '#FAD670' : 'var(--leaf-dark)'};">战力 ${ev.Power.toLocaleString()}</div>
              <div class="item-sub" style="font-size:10px;">${esc(ev.SynergyLabel)}</div>
              <div class="card-btns-2">
                <button class="btn btn-xs sc-rem" data-uid="${ev.Entry.Uid}">取回</button>
                <button class="btn btn-xs btn-gold sc-enh" data-uid="${ev.Entry.Uid}">原地强化</button>
              </div>
            </div>`;
          }).join('')}</div>`}`;

    main.querySelectorAll('.sc-rem').forEach((b) => { b.onclick = () => { const r = engine.removeFromShowcase(b.dataset.uid); showToast(r.message); render(); }; });
    main.querySelectorAll('.sc-enh').forEach((b) => { b.onclick = () => confirmShowcaseInPlaceForge(b.dataset.uid, () => render()); });
  }

  function renderSetsBody(main, topHtml, sc) {
    const placedMap = {};
    sc.Items.forEach((ev) => {
      if (!placedMap[ev.Def.id] || (ev.Entry.EnhanceLevel || 0) > (placedMap[ev.Def.id].Entry.EnhanceLevel || 0)) placedMap[ev.Def.id] = ev;
    });
    const bestOwned = {};
    engine.getOwnedItems().forEach((ov) => {
      if (!bestOwned[ov.ItemId] || ov.EnhanceLevel > bestOwned[ov.ItemId].EnhanceLevel) bestOwned[ov.ItemId] = ov;
    });

    main.innerHTML = `${topHtml}
      ${CAT.ROLE_SETS.map((set) => {
        const have = set.itemIds.filter((id) => !!placedMap[id]).length;
        const active = have === set.itemIds.length;
        return `<div class="set-card" style="border-color:${active ? set.aura : 'var(--border)'};background:${active ? '#FFFBEF' : 'var(--card)'};">
          <div class="set-head">
            ${set.npc ? `<img class="npc-avatar" src="${set.npc}" style="border-color:${set.aura};" alt="${esc(set.name)}" />` : ''}
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span style="font-size:13.5px;font-weight:800;">${esc(set.name)}</span>
                <span class="tag-mini" style="background:var(--gold-bg);color:#8A4F0A;">${set.mult}×</span>
                <span class="tag-mini" style="background:${active ? set.aura : 'var(--sub)'};color:${active ? '#fff' : 'var(--ink-sub)'};">${active ? '★已激活' : `${have}/${set.itemIds.length}`}</span>
              </div>
              <div style="font-size:11px;color:var(--ink-sub);margin-top:3px;">${esc(set.lore)}</div>
              <div style="font-size:11.5px;font-weight:800;color:${active ? 'var(--leaf-dark)' : 'var(--ink)'};margin-top:3px;">效果：${esc(set.bonus)}</div>
            </div>
          </div>
          <div class="set-slots">
            ${set.itemIds.map((id) => {
              const it = CAT.ITEM_BY_ID[id];
              if (!it) return '';
              const m = ENG.getMeta(it.rarity);
              const pl = placedMap[id];
              const bag = !pl ? bestOwned[id] : null;
              return `<div class="set-slot" style="background:${pl ? m.cardBg : (bag ? '#FFF9E6' : '#F1ECE0')};border-color:${pl ? m.border : (bag ? 'var(--leaf)' : 'var(--border)')};color:${pl && m.dark ? m.badgeText : 'var(--ink)'};">
                <div style="width:100%;display:flex;justify-content:space-between;font-size:9.5px;font-weight:800;margin-bottom:2px;">
                  <span>${m.label}</span>
                  <span style="color:${pl ? (pl.Entry.EnhanceLevel > 0 ? '#CC760C' : 'var(--leaf-dark)') : (bag ? 'var(--leaf-dark)' : 'var(--ink-sub)')};">${pl ? (pl.Entry.EnhanceLevel > 0 ? `+${pl.Entry.EnhanceLevel}` : '✓已放') : (bag ? '+放入' : '缺件')}</span>
                </div>
                ${itemSpriteHtml(it.id, 38, !pl && !bag)}
                <div class="item-name" style="font-size:10.5px;">${esc(it.name)}</div>
                ${pl ? `<div class="card-btns-2" style="margin-top:4px;gap:3px;">
                  <button class="btn btn-xs btn-gold set-enh" data-uid="${pl.Entry.Uid}" style="font-size:10px;padding:3px 2px;">强化</button>
                  <button class="btn btn-xs set-rem" data-uid="${pl.Entry.Uid}" style="font-size:10px;padding:3px 2px;">取回</button>
                </div>` : (bag ? `<button class="btn btn-xs btn-leaf set-put" data-uid="${bag.Uid || ''}" data-id="${it.id}" style="width:100%;margin-top:4px;font-size:10px;padding:3px;">放入</button>` : '')}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}`;

    main.querySelectorAll('.set-put').forEach((b) => { b.onclick = () => { const r = engine.moveToShowcase(b.dataset.uid || null, b.dataset.id); if (r.ok && engine.data.Settings.EnableSound) audio.playCoin(); showToast(r.message); render(); }; });
    main.querySelectorAll('.set-rem').forEach((b) => { b.onclick = () => { const r = engine.removeFromShowcase(b.dataset.uid); showToast(r.message); render(); }; });
    main.querySelectorAll('.set-enh').forEach((b) => { b.onclick = () => confirmShowcaseInPlaceForge(b.dataset.uid, () => render()); });
  }

  function renderShowcasePickBody(main, topHtml) {
    const owned = engine.getOwnedItems().sort(compareOwned);
    main.innerHTML = `${topHtml}
      ${owned.length === 0 ? `<div class="card" style="text-align:center;color:var(--ink-sub);padding:24px;">仓库里暂无可放入藏品</div>`
        : `<div class="item-grid">${owned.map((ov) => {
            const it = CAT.ITEM_BY_ID[ov.ItemId];
            const m = ENG.getMeta(it.rarity);
            const isSet = ENG.isRoleSetItem(it.id);
            return `<div class="item-card sc-pick-put" data-uid="${ov.Uid || ''}" data-id="${it.id}" style="cursor:pointer;background:${m.cardBg};border-color:${m.border};color:${m.dark ? m.badgeText : 'var(--ink)'};">
              ${itemSpriteHtml(it.id, 50, false)}
              <div class="item-name">${esc(it.name)}${ov.EnhanceLevel > 0 ? ` +${ov.EnhanceLevel}` : ''}</div>
              <div class="item-sub" style="font-weight:800;color:${isSet ? '#7C3EC0' : 'var(--leaf-dark)'};">${isSet ? '+ 放入套装展位' : '+ 放入自由展柜'}</div>
            </div>`;
          }).join('')}</div>`}`;
    main.querySelectorAll('.sc-pick-put').forEach((el) => {
      el.onclick = () => { const r = engine.moveToShowcase(el.dataset.uid || null, el.dataset.id); if (r.ok && engine.data.Settings.EnableSound) audio.playCoin(); showToast(r.message); render(); };
    });
  }

  function renderCodexBody(main, subBar) {
    const map = {};
    engine.data.Codex.forEach((c) => { map[c.ItemId] = c; });
    const list = CAT.ITEMS.filter((it) => ui.cxFilter < 0 || it.rarity === ui.cxFilter);
    const pct = ((engine.data.Codex.length / CAT.ITEMS.length) * 100).toFixed(1);

    main.innerHTML = `${subBar}
      <div class="card" style="padding:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:800;">
          <span>📖 渡鸦博物图鉴</span><span>${engine.data.Codex.length} / ${CAT.ITEMS.length} (${pct}%)</span>
        </div>
        <div class="progress-bar" style="margin:6px 0 8px;"><div class="progress-fill" style="width:${pct}%;background:var(--leaf);"></div></div>
        <div style="font-size:11px;color:var(--ink-sub);margin-bottom:8px;">点击任意已点亮卡片，可查看详细档案与「累计出过几个」</div>
        ${renderRarityFilters(ui.cxFilter, 'cx')}
      </div>
      <div class="codex-grid">
        ${list.map((it) => {
          const m = ENG.getMeta(it.rarity);
          const entry = map[it.id];
          if (!entry) {
            return `<div class="item-card" style="background:#ECE5D7;border-color:var(--border);padding:7px 4px;">
              <div class="top-row"><span class="tag-mini" style="background:#DED6C6;color:var(--ink-sub);">${m.label}</span></div>
              ${itemSpriteHtml(it.id, 44, true)}
              <div class="item-name" style="color:var(--ink-sub);">？？？</div>
            </div>`;
          }
          // 右上角不显示数量角标，点进详情才显示出过几个！
          return `<div class="item-card cx-open" data-id="${it.id}" style="cursor:pointer;background:${m.cardBg};border-color:${m.border};color:${m.dark ? m.badgeText : 'var(--ink)'};padding:7px 4px;">
            <div class="top-row"><span class="tag-mini" style="background:${m.badgeBg};color:${m.badgeText};">${m.label}</span></div>
            ${itemSpriteHtml(it.id, 46, false)}
            <div class="item-name" style="font-size:11px;">${esc(it.name)}</div>
          </div>`;
        }).join('')}
      </div>`;

    bindRarityFilters(main, 'cx', (val) => { ui.cxFilter = val; render(); });
    main.querySelectorAll('.cx-open').forEach((el) => {
      el.onclick = () => {
        const it = CAT.ITEM_BY_ID[el.dataset.id];
        const entry = map[el.dataset.id];
        if (it && entry) showItemRevealModal(it, 0, false, false, false, entry);
      };
    });
  }

  function renderRarityFilters(active, key) {
    return `<div class="filter-row">
      <button class="filter-pill${active < 0 ? ' active' : ''}" data-flt-${key}="-1">全部</button>
      ${CAT.RARITIES.map((r) => `<button class="filter-pill${active === r.tier ? ' active' : ''}" data-flt-${key}="${r.tier}">${r.label}</button>`).join('')}
    </div>`;
  }

  function bindRarityFilters(root, key, onPick) {
    root.querySelectorAll(`[data-flt-${key}]`).forEach((b) => {
      b.onclick = () => onPick(Number(b.getAttribute(`data-flt-${key}`)));
    });
  }

  // ==================== 物品揭晓 & 图鉴详情弹窗 ====================
  function showItemRevealModal(item, enhLv, canSell, isNew, isUp, codexEntry, onAfterClose, extraBadge) {
    const m = ENG.getMeta(item.rarity);
    const setLbl = ENG.getRoleSetLabelForItem(item.id);
    const val = ENG.getEnhancedValue(item, enhLv);
    const sellVal = engine.getEffectiveSellUnitPrice(item, enhLv);
    const slips = ENG.getDisassembleSlips(item.rarity, enhLv);

    openModal(`
      <div style="text-align:center;padding:6px 4px;border-radius:14px;background:${m.cardBg};border:2px solid ${m.border};color:${m.dark ? m.badgeText : 'var(--ink)'};">
        <div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-bottom:10px;">
          <span class="tag-mini" style="background:${m.badgeBg};color:${m.badgeText};">${m.colorName}·${m.label}</span>
          ${enhLv > 0 ? `<span class="tag-mini" style="background:var(--gold-bg);color:#8A4F0A;">${ENG.getStarBadge(enhLv)} +${enhLv}</span>` : ''}
          ${isNew ? `<span class="tag-mini" style="background:var(--gold-bg);color:#94560A;">★新图鉴</span>` : ''}
          ${isUp ? `<span class="tag-mini" style="background:#FEE0EC;color:#A62462;">↑越级惊喜</span>` : ''}
          ${extraBadge ? `<span class="tag-mini" style="background:#FEE2E2;color:#B62230;">${esc(extraBadge)}</span>` : ''}
        </div>
        <div style="margin:6px 0;">${itemSpriteHtml(item.id, 84, false)}</div>
        <div style="font-size:18px;font-weight:900;margin-top:6px;">${esc(item.name)}${enhLv > 0 ? ` +${enhLv}` : ''}</div>
        <div style="font-size:12.5px;opacity:0.85;margin-top:2px;">「${esc(item.subtitle)}」</div>
        <div style="font-size:12.5px;opacity:0.88;margin:8px 10px 10px;line-height:1.55;">${esc(item.flavor)}</div>
        ${setLbl ? `<div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#F2E8FF;border:1.5px solid #945CD4;color:#5C2A9C;font-size:11.5px;font-weight:800;margin-bottom:8px;">✦ 套装组件：${esc(setLbl)}</div>` : ''}
        <div style="font-size:12.5px;font-weight:800;padding:5px 10px;border-radius:999px;display:inline-block;background:${m.dark ? '#3A322A' : 'var(--gold-bg)'};color:${m.dark ? '#F8DA88' : '#8A4F0A'};">
          ${enhLv > 0 ? `战力估值 ${val} · 回收 ${sellVal} 币` : `基础价值 ${val} 币 · 分解得 ${slips} 张报销单`}
        </div>
        ${codexEntry ? `<div style="margin-top:8px;padding:6px 10px;border-radius:10px;background:${m.dark ? '#303A48' : '#E8F4FC'};border:1.5px solid #5892CE;color:${m.dark ? '#C6E4FF' : '#24568E'};font-size:12.5px;font-weight:800;">
          ✦ 累计共出过：${codexEntry.TotalObtained} 个 · 首次收录：${esc(codexEntry.FirstObtainedAt || '已收录')}
        </div>` : ''}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-leaf" style="flex:1;" id="revKeep">${codexEntry ? '关闭详情' : '收入仓库'}</button>
        ${canSell ? `<button class="btn btn-gold" style="flex:1;" id="revSell">当场售出 +${sellVal}</button>` : ''}
      </div>
    `);

    const finish = () => { closeModal(); if (onAfterClose) onAfterClose(); };
    document.getElementById('revKeep').onclick = finish;
    const bs = document.getElementById('revSell');
    if (bs) {
      bs.onclick = () => {
        const doSell = () => {
          const earned = engine.sellNormalItem(item.id, 1);
          if (earned > 0 && engine.data.Settings.EnableSound) audio.playCoin();
          showToast(`当场售出 +${earned} 仿真币！`);
          finish();
          render();
        };
        if (item.rarity >= 4 || setLbl) {
          confirmDialog('高阶/套装售卖确认', `确定售出 <b>${esc(item.name)}</b> 换取 ${sellVal} 仿真币吗？${setLbl ? `<br/><span style="color:#9C2C24;">⚠ 属于【${esc(setLbl)}】组件</span>` : ''}`, '确定售出', 'btn-coral', doSell);
        } else doSell();
      };
    }
  }

  // ==================== 公告栏弹窗 ====================
  function showNoticeModal() {
    engine.markNoticeSeen();
    updateChrome();
    const claimed = engine.isCurrentRewardClaimed();
    const rw = CAT.CURRENT_UPDATE_REWARD;
    openModal(`
      <h3 style="font-size:16.5px;margin-bottom:4px;">📜 渡鸦工坊更新公告栏</h3>
      <div style="font-size:11.5px;color:var(--ink-sub);margin-bottom:10px;">每次更新均清晰记录改动并赠送专属礼盒（常规默认 5 金盒 + 1 红盒）</div>
      <div style="padding:10px;border-radius:12px;background:#FEF0F7;border:1.5px solid var(--pink);color:#94225C;margin-bottom:12px;">
        <div style="font-size:12.5px;font-weight:800;">🎁 本次 v${CAT.APP_VERSION} 特别更新奖励</div>
        <div style="font-size:12px;margin-top:3px;">${esc(rw.summary)}</div>
        <div style="font-size:11.5px;margin-top:4px;font-weight:800;">${claimed ? '✓ 已自动发放到「待开礼盒」队列！' : '<button class="btn btn-xs btn-coral" id="btnClaimInNotice">立即领取</button>'}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
        ${CAT.ANNOUNCEMENTS.map((a) => `
          <div style="padding:10px;border-radius:12px;background:var(--bg);border:1.5px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:13px;font-weight:900;">${esc(a.version)} · ${esc(a.title)}</span>
            </div>
            <div style="font-size:11px;font-weight:800;color:#9C4418;margin-bottom:5px;">福利：${esc(a.reward)}</div>
            <ul style="padding-left:16px;font-size:12px;line-height:1.55;color:var(--ink-sub);">
              ${a.items.map((line) => `<li>${esc(line)}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-leaf" style="width:100%;" id="btnCloseNotice">我知道了</button>
    `);
    document.getElementById('btnCloseNotice').onclick = closeModal;
    const cl = document.getElementById('btnClaimInNotice');
    if (cl) {
      cl.onclick = () => {
        const msg = engine.tryClaimCurrentUpdateReward();
        if (msg) {
          if (engine.data.Settings.EnableSound) audio.playOpen(6, false, false);
          showToast(msg);
          showNoticeModal();
          render();
        }
      };
    }
  }

  // ==================== 设置 & 全平台存档互通弹窗 ====================
  function showSettingsModal() {
    const s = engine.data.Settings;
    openModal(`
      <h3 style="font-size:16.5px;margin-bottom:10px;">⚙ 设置与全平台存档互通 (v${CAT.APP_VERSION})</h3>
      <div style="padding:10px;border-radius:12px;background:var(--bg);border:1.5px solid var(--border);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:800;">🔊 开启开箱与互动提示音</span>
        <button class="btn btn-sm ${s.EnableSound ? 'btn-leaf' : 'btn-muted'}" id="btnTogSound">${s.EnableSound ? '已开启' : '已静音'}</button>
      </div>

      <div style="padding:10px;border-radius:12px;background:#FFF9EA;border:1.5px solid var(--gold);margin-bottom:10px;">
        <div style="font-size:13px;font-weight:800;color:#8A4F0A;margin-bottom:4px;">🔄 全平台存档互通（电脑↔手机 / 手机↔手机）</div>
        <div style="font-size:11.5px;color:var(--ink-sub);margin-bottom:8px;line-height:1.5;">
          手机版与 Windows 电脑版使用 100% 同一套 JSON 存档结构！导出文件或复制存档码，发微信就能无缝接力游玩。
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
          <button class="btn btn-sm" id="btnExpJson">📤 导出 .json 文件</button>
          <button class="btn btn-sm btn-gold" id="btnImpJson">📥 导入 .json 文件</button>
          <button class="btn btn-sm" id="btnCopyCode">📋 复制存档码</button>
          <button class="btn btn-sm btn-leaf" id="btnShowPaste">📥 粘贴存档码导入</button>
        </div>
        <div id="pasteAreaWrap" class="hidden" style="margin-top:6px;">
          <textarea class="save-ta" id="pasteSaveTa" placeholder="在此粘贴电脑或手机导出的 TLR_SAVE:... 存档码或完整 JSON 文本"></textarea>
          <button class="btn btn-sm btn-leaf" style="width:100%;margin-top:6px;" id="btnDoPasteImp">校验并覆盖导入</button>
        </div>
      </div>

      <div style="padding:10px;border-radius:12px;background:#EDF8EE;border:1.5px solid var(--leaf);margin-bottom:12px;font-size:11.5px;line-height:1.6;color:#24603A;">
        <b>📱 添加到手机桌面当 App 玩：</b><br/>
        · <b>iPhone (Safari)</b>：点底部「分享 ⬆」→「添加到主屏幕」<br/>
        · <b>安卓 (Chrome/Edge)</b>：点右上角菜单「⋮」→「安装应用 / 添加到主屏幕」
      </div>

      <button class="btn btn-raven" style="width:100%;" id="btnCloseSet">完成关闭</button>
    `);

    document.getElementById('btnCloseSet').onclick = closeModal;
    document.getElementById('btnTogSound').onclick = () => {
      engine.data.Settings.EnableSound = !engine.data.Settings.EnableSound;
      engine.save();
      showSettingsModal();
    };
    document.getElementById('btnExpJson').onclick = () => {
      const json = engine.exportSaveJson();
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TheLuckyRaven_Save_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('存档 .json 已导出！可在电脑版「设置 → 导入 .json」直接导入');
    };
    document.getElementById('btnImpJson').onclick = () => {
      const inp = document.getElementById('hiddenFileInput');
      inp.value = '';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const r = engine.importSaveText(String(reader.result || ''));
          showToast(r.message);
          if (r.ok) { closeModal(); render(); }
        };
        reader.readAsText(f, 'utf-8');
      };
      inp.click();
    };
    document.getElementById('btnCopyCode').onclick = async () => {
      const code = engine.exportSaveCode();
      try {
        await navigator.clipboard.writeText(code);
        showToast('已复制通用存档码！发微信到电脑或其他手机即可粘贴导入');
      } catch (e) {
        const wrap = document.getElementById('pasteAreaWrap');
        const ta = document.getElementById('pasteSaveTa');
        wrap.classList.remove('hidden');
        ta.value = code;
        ta.select();
        showToast('请长按下方输入框全选复制存档码');
      }
    };
    document.getElementById('btnShowPaste').onclick = () => {
      document.getElementById('pasteAreaWrap').classList.toggle('hidden');
    };
    document.getElementById('btnDoPasteImp').onclick = () => {
      const val = document.getElementById('pasteSaveTa').value;
      const r = engine.importSaveText(val);
      showToast(r.message);
      if (r.ok) { closeModal(); render(); }
    };
  }

  // ==================== 启动初始化与巡逻定时 ====================
  function checkOfflinePatrolAndNotify() {
    const res = engine.settleOfflinePatrol();
    if (res.cycles > 0 && res.boxes.length > 0) {
      const sc = engine.evaluateShowcase();
      const topR = res.boxes.reduce((mx, b) => Math.max(mx, b.RarityValue), 0);
      if (engine.data.Settings.EnableSound) audio.playDrop(topR, sc.HasLaoBing2, sc.HasRuiSet, res.doubleCount > 0);
      showToast(`🐦 渡鸦巡逻 ${res.cycles} 次归来，衔回了 ${res.boxes.length} 个彩色礼盒！`);
      render();
    } else if (res.cycles > 0) {
      updatePatrolAndStepLive();
    }
  }

  function init() {
    // 绑定顶栏与底栏
    document.getElementById('btnNotice').onclick = showNoticeModal;
    document.getElementById('btnSettings').onclick = showSettingsModal;
    document.getElementById('modalRoot').onclick = (e) => {
      if (e.target.id === 'modalRoot') closeModal();
    };
    document.querySelectorAll('#tabBar .tab-item').forEach((btn) => {
      btn.onclick = () => { ui.tab = btn.dataset.tab; render(); };
    });

    // 注册离线 PWA Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // 发放老版本冬季限定（未领则补发）+ 本次 v2.10.0 更新奖励（2 粉盒 + 5 金盒）
    const wMsg = engine.tryClaimV280WinterGift();
    const uMsg = engine.tryClaimCurrentUpdateReward();
    if (uMsg) showToast(uMsg);
    else if (wMsg) showToast(wMsg);

    // 结算离线巡逻
    checkOfflinePatrolAndNotify();
    render();

    // 新版本首次打开自动展示公告栏
    if (engine.hasUnseenNotice()) {
      setTimeout(showNoticeModal, 350);
    }

    // 每秒更新巡逻倒计时并自动触发整 5 分钟巡逻结算
    setInterval(() => {
      checkOfflinePatrolAndNotify();
      if (ui.tab === 'gifts') updatePatrolAndStepLive();
    }, 1000);

    // 切回前台时立即结算离线巡逻
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkOfflinePatrolAndNotify();
    });
  }

  init();
})();
