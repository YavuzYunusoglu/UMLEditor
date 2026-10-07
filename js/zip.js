'use strict';
/* Bağımlılıksız, sıkıştırmasız (STORE) ZIP yazıcı — C# script'lerini tek dosyada indirmek için */
(function (global) {
  const App = (global.App = global.App || {});

  let table = null;
  function crc32(bytes) {
    if (!table) {
      table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** files: [{ name, data: string|Uint8Array }] -> Uint8Array */
  function build(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const entries = files.map((f) => {
      const name = enc.encode(f.name);
      // UTF-8 BOM: Unity/Visual Studio Türkçe karakterleri doğru okusun
      const data = typeof f.data === 'string' ? enc.encode((f.bom ? '﻿' : '') + f.data) : f.data;
      return { name, data, crc: crc32(data) };
    });
    let size = 22;
    for (const e of entries) size += 30 + e.name.length + e.data.length + 46 + e.name.length;
    const out = new Uint8Array(size);
    const dv = new DataView(out.buffer);
    let p = 0;
    const offsets = [];
    for (const e of entries) {
      offsets.push(p);
      dv.setUint32(p, 0x04034b50, true);
      dv.setUint16(p + 4, 20, true);
      dv.setUint16(p + 6, 0x0800, true);
      dv.setUint16(p + 8, 0, true);
      dv.setUint16(p + 10, dosTime, true);
      dv.setUint16(p + 12, dosDate, true);
      dv.setUint32(p + 14, e.crc, true);
      dv.setUint32(p + 18, e.data.length, true);
      dv.setUint32(p + 22, e.data.length, true);
      dv.setUint16(p + 26, e.name.length, true);
      dv.setUint16(p + 28, 0, true);
      out.set(e.name, p + 30);
      out.set(e.data, p + 30 + e.name.length);
      p += 30 + e.name.length + e.data.length;
    }
    const cdStart = p;
    entries.forEach((e, i) => {
      dv.setUint32(p, 0x02014b50, true);
      dv.setUint16(p + 4, 20, true);
      dv.setUint16(p + 6, 20, true);
      dv.setUint16(p + 8, 0x0800, true);
      dv.setUint16(p + 10, 0, true);
      dv.setUint16(p + 12, dosTime, true);
      dv.setUint16(p + 14, dosDate, true);
      dv.setUint32(p + 16, e.crc, true);
      dv.setUint32(p + 20, e.data.length, true);
      dv.setUint32(p + 24, e.data.length, true);
      dv.setUint16(p + 28, e.name.length, true);
      dv.setUint16(p + 30, 0, true);
      dv.setUint16(p + 32, 0, true);
      dv.setUint16(p + 34, 0, true);
      dv.setUint16(p + 36, 0, true);
      dv.setUint32(p + 38, 0, true);
      dv.setUint32(p + 42, offsets[i], true);
      out.set(e.name, p + 46);
      p += 46 + e.name.length;
    });
    const cdSize = p - cdStart;
    dv.setUint32(p, 0x06054b50, true);
    dv.setUint16(p + 4, 0, true);
    dv.setUint16(p + 6, 0, true);
    dv.setUint16(p + 8, entries.length, true);
    dv.setUint16(p + 10, entries.length, true);
    dv.setUint32(p + 12, cdSize, true);
    dv.setUint32(p + 16, cdStart, true);
    dv.setUint16(p + 20, 0, true);
    return out;
  }

  App.Zip = { build, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
