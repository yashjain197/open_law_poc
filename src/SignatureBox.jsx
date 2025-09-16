import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import clsx from "clsx";

/** Trim transparent margins from a canvas safely (no external deps). */
function trimTransparent(sourceCanvas, padding = 10) {
  try {
    const w = sourceCanvas.width, h = sourceCanvas.height;
    const ctx = sourceCanvas.getContext("2d");
    const pixels = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = pixels[(y * w + x) * 4 + 3];
        if (a !== 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
    }
    if (maxX < minX || maxY < minY) return sourceCanvas;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(w - 1, maxX + padding);
    maxY = Math.min(h - 1, maxY + padding);
    const newW = maxX - minX + 1, newH = maxY - minY + 1;
    const trimmed = document.createElement("canvas");
    trimmed.width = newW; trimmed.height = newH;
    trimmed.getContext("2d").drawImage(sourceCanvas, minX, minY, newW, newH, 0, 0, newW, newH);
    return trimmed;
  } catch { return sourceCanvas; }
}

export default function SignatureBox({
  value,
  onChange,
  height = 180,
  label = "Draw your signature",
  className = "",
}) {
  const sigRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (value && sigRef.current) {
      try { sigRef.current.fromDataURL(value, { ratio: 1 }); setIsEmpty(false); } catch {}
    }
  }, [value]);

  const produceDataURL = () => {
    const c = sigRef.current?.getCanvas();
    if (!c) return "";
    return trimTransparent(c, 10).toDataURL("image/png");
  };

  const handleEnd = () => {
    if (!sigRef.current) return;
    const empty = sigRef.current.isEmpty();
    setIsEmpty(empty);
    onChange?.(empty ? "" : produceDataURL());
  };

  const clear = () => { sigRef.current?.clear(); setIsEmpty(true); onChange?.(""); };
  const undo = () => {
    const s = sigRef.current; if (!s) return;
    const data = s.toData(); if (!data?.length) return;
    data.pop(); s.fromData(data);
    const nowEmpty = s.isEmpty(); setIsEmpty(nowEmpty);
    onChange?.(nowEmpty ? "" : produceDataURL());
  };

  return (
    <div className={clsx("grid gap-2", className)}>
      <div className="text-sm text-gray-700 font-medium">{label}</div>
      <div className="rounded-2xl border border-gray-300 bg-white shadow-sm overflow-hidden">
        <SignatureCanvas
          ref={sigRef}
          onEnd={handleEnd}
          minWidth={0.8}
          maxWidth={2.2}
          throttle={16}
          velocityFilterWeight={0.7}
          penColor="#111827"
          canvasProps={{
            style: {
              width: "100%", height,
              display: "block",
              background: "repeating-linear-gradient(180deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 34px, rgba(59,130,246,0.07) 35px)",
              cursor: "crosshair",
            },
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn" onClick={undo} disabled={isEmpty}>Undo</button>
        <button type="button" className="btn" onClick={clear} disabled={isEmpty}>Clear</button>
        <span className="text-xs text-gray-500">Tip: sign with your mouse/trackpad.</span>
      </div>
    </div>
  );
}
