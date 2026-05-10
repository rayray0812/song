(function () {
  const cards = document.querySelectorAll('.countdown-card');
  if (!cards.length) return;

  const PROGRESS_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

  function setNum(card, unit, value) {
    const el = card.querySelector('[data-unit="' + unit + '"]');
    if (!el) return;
    const v = String(value);
    if (el.textContent === v) return;
    el.textContent = v;
    const animClass = unit === 'seconds' ? 'cd-tick' : 'cd-flip';
    el.classList.remove('cd-flip', 'cd-tick');
    void el.offsetWidth;
    el.classList.add(animClass);
  }

  function tick() {
    const now = Date.now();
    cards.forEach((card) => {
      const target = new Date(card.dataset.target).getTime();
      const diff = target - now;
      const isPast = diff <= 0;
      const safe = isPast ? 0 : diff;

      const days = Math.floor(safe / 86400000);
      const hours = Math.floor((safe % 86400000) / 3600000);
      const minutes = Math.floor((safe % 3600000) / 60000);
      const seconds = Math.floor((safe % 60000) / 1000);

      setNum(card, 'days', days);
      setNum(card, 'hours', String(hours).padStart(2, '0'));
      setNum(card, 'minutes', String(minutes).padStart(2, '0'));
      setNum(card, 'seconds', String(seconds).padStart(2, '0'));

      const fill = card.querySelector('.countdown-progress-fill');
      if (fill) {
        const remaining = Math.max(0, Math.min(1, safe / PROGRESS_WINDOW_MS));
        const pct = (1 - remaining) * 100;
        fill.style.width = pct.toFixed(2) + '%';
      }

      card.classList.toggle('is-soon', !isPast && days < 7);
      card.classList.toggle('is-imminent', !isPast && safe < 86400000);
      card.classList.toggle('is-past', isPast);
    });
  }

  tick();
  setInterval(tick, 1000);
})();
