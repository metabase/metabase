/* eslint-disable react/prop-types */
import React from "react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

const Th = styled.th`
  color: ${color("text-dark")};
`;

const AdminContentTable = ({ columnTitles, children }) => (
  <table className="ContentTable">
    <thead>
      <tr>
        {columnTitles &&
          columnTitles.map((title, index) => <Th key={index}>{title}</Th>)}
      </tr>
    </thead>
    <tbody>{children}</tbody>
  </table>
);

export default AdminContentTable;
