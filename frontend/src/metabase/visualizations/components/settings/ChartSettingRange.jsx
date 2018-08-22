import React from "react";

const ChartSettingRange = ({ value, onChange }) => (
  <table>
    <thead>
      <tr>
        <th>Min</th>
        <th>Max</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <input
            type="number"
            className="input full"
            value={value[0]}
            onChange={e => onChange([parseFloat(e.target.value), value[1]])}
          />
        </td>
        <td>
          <input
            type="number"
            className="input full"
            value={value[1]}
            onChange={e => onChange([value[0], parseFloat(e.target.value)])}
          />
        </td>
      </tr>
    </tbody>
  </table>
);

export default ChartSettingRange;
