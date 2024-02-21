import { useAvailableFonts } from "metabase-embedding-sdk";

import "./FontSelector.css";

export const FontSelector = () => {
  const { availableFonts: fonts, currentFont, setFont } = useAvailableFonts();

  return (
    <div className="FontSelector--container">
      <label className="FontSelector--label">Select a font:</label>
      <select
        value={currentFont}
        onChange={e => setFont(e.target.value)}
        className="FontSelector-button"
        style={{
          fontFamily: currentFont,
        }}
      >
        {fonts?.map(font => (
          <option value={font}>{font}</option>
        ))}
      </select>
    </div>
  );
};
