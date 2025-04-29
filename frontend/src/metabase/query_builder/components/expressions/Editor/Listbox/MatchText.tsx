import S from "./Listbox.module.css";

export function MatchText({
  text,
  ranges = [],
}: {
  text: string;
  ranges?: [number, number][];
}) {
  const res = [];
  let prevIndex = 0;

  for (const range of ranges) {
    if (range[0] >= 0) {
      res.push(text.slice(prevIndex, range[0]));
    }
    res.push(
      <span className={S.highlight} key={range[0]}>
        {text.slice(Math.max(0, range[0]), range[1] + 1)}
      </span>,
    );
    prevIndex = range[1] + 1;
  }
  res.push(text.slice(prevIndex, text.length));

  return <span className={S.label}>{res}</span>;
}
