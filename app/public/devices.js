// Katalog urządzeń: wymiary ekranu w punktach (pt), promienie zaokrągleń,
// kształt wycięcia i kolory obudowy. 1 pt = 1 px przy skali 100%.
(function () {
  const P = {
    xseries:  [['Gwiezdna szarość', '#4a4a4d'], ['Srebrny', '#dcdcd8'], ['Złoty', '#e9d1b1'], ['Nocna zieleń', '#4e5851']],
    xr:       [['Czarny', '#2d2e30'], ['Biały', '#e9e9e7'], ['Fioletowy', '#c9bfe0'], ['Żółty', '#f2df8b'], ['Zielony', '#c4dcc4'], ['(PRODUCT)RED', '#b81f2d']],
    i12:      [['Czarny', '#2b2d30'], ['Biały', '#eceae6'], ['Niebieski', '#1f3f5e'], ['Zielony', '#cbe5d0'], ['Fioletowy', '#c7bfe0'], ['(PRODUCT)RED', '#b81f2d']],
    i12pro:   [['Grafitowy', '#4e4d4a'], ['Srebrny', '#e3e2dd'], ['Złoty', '#ecd8b8'], ['Pacyficzny niebieski', '#2f4a5f']],
    i13:      [['Północ', '#2e3237'], ['Księżycowa poświata', '#e9e4dc'], ['Niebieski', '#2b4a6a'], ['Różowy', '#f2cfd0'], ['Zielony', '#394a3e'], ['(PRODUCT)RED', '#b81f2d']],
    i13pro:   [['Grafitowy', '#4e4d4a'], ['Złoty', '#ecd8b8'], ['Srebrny', '#e3e2dd'], ['Górski błękit', '#a7c1d9'], ['Alpejska zieleń', '#586e5a']],
    i14:      [['Północ', '#2e3237'], ['Księżycowa poświata', '#e9e4dc'], ['Niebieski', '#9fb3c5'], ['Fioletowy', '#d5cbe0'], ['Żółty', '#f2df8b'], ['(PRODUCT)RED', '#b81f2d']],
    i14pro:   [['Gwiezdna czerń', '#3b3a38'], ['Srebrny', '#e3e2dd'], ['Złoty', '#f0dcbd'], ['Głęboka purpura', '#4f4659']],
    i15:      [['Czarny', '#3d4043'], ['Niebieski', '#cfdde5'], ['Zielony', '#d8e3d3'], ['Żółty', '#f3e7c2'], ['Różowy', '#f2d6d9']],
    i15pro:   [['Tytan naturalny', '#b0aba0'], ['Tytan niebieski', '#3a4350'], ['Tytan biały', '#e4e2dd'], ['Tytan czarny', '#3b3b3d']],
    i16:      [['Czarny', '#2f3032'], ['Biały', '#ececec'], ['Różowy', '#ef9fc5'], ['Morski', '#9dc7c2'], ['Ultramaryna', '#6f7fe8']],
    i16pro:   [['Tytan pustynny', '#c3a891'], ['Tytan naturalny', '#b9b3a8'], ['Tytan biały', '#e6e4df'], ['Tytan czarny', '#3c3c3e']],
    i16e:     [['Czarny', '#2f3032'], ['Biały', '#ececec']],
    i17:      [['Czarny', '#2f3032'], ['Lawendowy', '#c9bfe3'], ['Mglisty błękit', '#b7cbe0'], ['Szałwiowy', '#b8c7ae'], ['Biały', '#ececec']],
    i17pro:   [['Kosmiczny pomarańcz', '#e0773b'], ['Głęboki błękit', '#3c4a66'], ['Srebrny', '#e2e2e2']],
    air:      [['Gwiezdna czerń', '#2f3032'], ['Obłoczna biel', '#efeee9'], ['Jasne złoto', '#eadcc3'], ['Błękit nieba', '#c9dbe8']],
    se:       [['Północ', '#2e3237'], ['Księżycowa poświata', '#e9e4dc'], ['(PRODUCT)RED', '#b81f2d']],
    android:  [['Grafitowy', '#3a3b3e'], ['Srebrny', '#d9d9d6'], ['Niebieski', '#5b7393']],
  };

  // style: notch | island | home | punch    btn: switch | action
  const D = (name, style, w, h, r, o) => Object.assign({ name, style, w, h, r, bz: 6, bd: 3.6, btn: 'switch', cc: false, finish: 'alu' }, o);
  const N12 = { nw: 210, nh: 31 }, N13 = { nw: 162, nh: 33 }, NX = { nw: 209, nh: 30 };
  const IS = { iw: 126, ih: 37.3, it: 11.3 };

  const MODELS = {
    'x':        D('iPhone X', 'notch', 375, 812, 39, { ...NX, bz: 6.5, pal: 'xseries', finish: 'steel' }),
    'xs':       D('iPhone XS', 'notch', 375, 812, 39, { ...NX, bz: 6.5, pal: 'xseries', finish: 'steel' }),
    'xsmax':    D('iPhone XS Max', 'notch', 414, 896, 39, { ...NX, bz: 6.5, pal: 'xseries', finish: 'steel' }),
    'xr':       D('iPhone XR', 'notch', 414, 896, 41.5, { ...NX, bz: 10, pal: 'xr' }),
    '11':       D('iPhone 11', 'notch', 414, 896, 41.5, { ...NX, bz: 10, pal: 'xr' }),
    '11pro':    D('iPhone 11 Pro', 'notch', 375, 812, 39, { ...NX, bz: 6.5, pal: 'xseries', finish: 'steel' }),
    '11promax': D('iPhone 11 Pro Max', 'notch', 414, 896, 39, { ...NX, bz: 6.5, pal: 'xseries', finish: 'steel' }),
    'se2':      D('iPhone SE (2. gen.)', 'home', 375, 667, 0, { pal: 'se' }),
    'se3':      D('iPhone SE (3. gen.)', 'home', 375, 667, 0, { pal: 'se' }),
    '12mini':   D('iPhone 12 mini', 'notch', 375, 812, 44, { nw: 178, nh: 31, pal: 'i12', bd: 3.2 }),
    '12':       D('iPhone 12', 'notch', 390, 844, 47.3, { ...N12, pal: 'i12' }),
    '12pro':    D('iPhone 12 Pro', 'notch', 390, 844, 47.3, { ...N12, pal: 'i12pro', finish: 'steel' }),
    '12promax': D('iPhone 12 Pro Max', 'notch', 428, 926, 53.3, { ...N12, pal: 'i12pro', finish: 'steel' }),
    '13mini':   D('iPhone 13 mini', 'notch', 375, 812, 44, { nw: 150, nh: 33, pal: 'i13', bd: 3.2 }),
    '13':       D('iPhone 13', 'notch', 390, 844, 47.3, { ...N13, pal: 'i13' }),
    '13pro':    D('iPhone 13 Pro', 'notch', 390, 844, 47.3, { ...N13, pal: 'i13pro', finish: 'steel' }),
    '13promax': D('iPhone 13 Pro Max', 'notch', 428, 926, 53.3, { ...N13, pal: 'i13pro', finish: 'steel' }),
    '14':       D('iPhone 14', 'notch', 390, 844, 47.3, { ...N13, pal: 'i14' }),
    '14plus':   D('iPhone 14 Plus', 'notch', 428, 926, 53.3, { ...N13, pal: 'i14' }),
    '14pro':    D('iPhone 14 Pro', 'island', 393, 852, 55, { ...IS, bz: 5.4, pal: 'i14pro', finish: 'steel' }),
    '14promax': D('iPhone 14 Pro Max', 'island', 430, 932, 55, { ...IS, bz: 5.4, pal: 'i14pro', finish: 'steel' }),
    '15':       D('iPhone 15', 'island', 393, 852, 55, { ...IS, bz: 5.6, pal: 'i15' }),
    '15plus':   D('iPhone 15 Plus', 'island', 430, 932, 55, { ...IS, bz: 5.6, pal: 'i15' }),
    '15pro':    D('iPhone 15 Pro', 'island', 393, 852, 55, { ...IS, bz: 4.6, bd: 3.4, btn: 'action', pal: 'i15pro', finish: 'ti' }),
    '15promax': D('iPhone 15 Pro Max', 'island', 430, 932, 55, { ...IS, bz: 4.6, bd: 3.4, btn: 'action', pal: 'i15pro', finish: 'ti' }),
    '16e':      D('iPhone 16e', 'notch', 390, 844, 47.3, { ...N13, btn: 'action', pal: 'i16e' }),
    '16':       D('iPhone 16', 'island', 393, 852, 55, { ...IS, bz: 5.4, btn: 'action', cc: true, pal: 'i16' }),
    '16plus':   D('iPhone 16 Plus', 'island', 430, 932, 55, { ...IS, bz: 5.4, btn: 'action', cc: true, pal: 'i16' }),
    '16pro':    D('iPhone 16 Pro', 'island', 402, 874, 62, { ...IS, it: 13.5, bz: 3.9, bd: 3.4, btn: 'action', cc: true, pal: 'i16pro', finish: 'ti' }),
    '16promax': D('iPhone 16 Pro Max', 'island', 440, 956, 62, { ...IS, it: 13.5, bz: 3.9, bd: 3.4, btn: 'action', cc: true, pal: 'i16pro', finish: 'ti' }),
    '17':       D('iPhone 17', 'island', 402, 874, 62, { ...IS, it: 13.5, bz: 4, btn: 'action', cc: true, pal: 'i17' }),
    'air':      D('iPhone Air', 'island', 420, 912, 62, { ...IS, it: 13.5, bz: 4, bd: 2.6, btn: 'action', cc: true, pal: 'air', finish: 'ti' }),
    '17pro':    D('iPhone 17 Pro', 'island', 402, 874, 62, { ...IS, it: 13.5, bz: 4, btn: 'action', cc: true, pal: 'i17pro' }),
    '17promax': D('iPhone 17 Pro Max', 'island', 440, 956, 62, { ...IS, it: 13.5, bz: 4, btn: 'action', cc: true, pal: 'i17pro' }),
    'android':  D('Android', 'punch', 412, 915, 34, { bz: 6, bd: 2.6, pal: 'android', btn: 'none' }),
  };

  // Identyfikatory sprzętowe (utsname.machine) -> model
  const IDS = {
    'iPhone10,3': 'x', 'iPhone10,6': 'x', 'iPhone11,2': 'xs', 'iPhone11,4': 'xsmax', 'iPhone11,6': 'xsmax', 'iPhone11,8': 'xr',
    'iPhone12,1': '11', 'iPhone12,3': '11pro', 'iPhone12,5': '11promax', 'iPhone12,8': 'se2',
    'iPhone13,1': '12mini', 'iPhone13,2': '12', 'iPhone13,3': '12pro', 'iPhone13,4': '12promax',
    'iPhone14,4': '13mini', 'iPhone14,5': '13', 'iPhone14,2': '13pro', 'iPhone14,3': '13promax', 'iPhone14,6': 'se3',
    'iPhone14,7': '14', 'iPhone14,8': '14plus', 'iPhone15,2': '14pro', 'iPhone15,3': '14promax',
    'iPhone15,4': '15', 'iPhone15,5': '15plus', 'iPhone16,1': '15pro', 'iPhone16,2': '15promax',
    'iPhone17,3': '16', 'iPhone17,4': '16plus', 'iPhone17,1': '16pro', 'iPhone17,2': '16promax', 'iPhone17,5': '16e',
    'iPhone18,3': '17', 'iPhone18,4': 'air', 'iPhone18,1': '17pro', 'iPhone18,2': '17promax',
  };

  const GROUPS = [
    ['iPhone 17', ['17', 'air', '17pro', '17promax']],
    ['iPhone 16', ['16e', '16', '16plus', '16pro', '16promax']],
    ['iPhone 15', ['15', '15plus', '15pro', '15promax']],
    ['iPhone 14', ['14', '14plus', '14pro', '14promax']],
    ['iPhone 13', ['13mini', '13', '13pro', '13promax']],
    ['iPhone 12', ['12mini', '12', '12pro', '12promax']],
    ['iPhone X – 11', ['x', 'xs', 'xsmax', 'xr', '11', '11pro', '11promax']],
    ['iPhone SE', ['se2', 'se3']],
    ['Inne', ['android']],
  ];

  // Dopasowanie modelu: najpierw identyfikator, potem rozmiar ekranu w punktach.
  function resolve(dev) {
    if (!dev) return null;
    if (dev.id && IDS[dev.id]) return IDS[dev.id];
    const w = Math.min(dev.w || 0, dev.h || 0), h = Math.max(dev.w || 0, dev.h || 0);
    if (w && h) {
      const hits = Object.keys(MODELS).filter(k => MODELS[k].w === w && MODELS[k].h === h);
      if (hits.length) return hits[hits.length - 1];
      return null;
    }
    return null;
  }

  window.Devices = { MODELS, PALETTES: P, IDS, GROUPS, resolve };
})();
