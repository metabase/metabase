// Crow's foot (many-to-one symbol) geometry constants
const GAP = 4;
const W = 8;
const H = 6;

export type SymbolType = "one" | "many";
type SymbolSide = "source" | "target";

type EdgeSymbolProps = {
  type: SymbolType;
  side: SymbolSide;
  x: number;
  y: number;
  stroke: string;
  strokeWidth: number;
};

export function EdgeSymbol({
  type,
  side,
  x,
  y,
  stroke,
  strokeWidth,
}: EdgeSymbolProps) {
  const anchorX = side === "source" ? x + GAP : x - GAP;
  const backX = side === "source" ? x + GAP + W : x - GAP - W;

  if (type === "one") {
    return (
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={anchorX}
        y1={y - H}
        x2={anchorX}
        y2={y + H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  return (
    <>
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={backX}
        y1={y}
        x2={anchorX}
        y2={y - H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={backX}
        y1={y}
        x2={anchorX}
        y2={y + H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </>
  );
}
