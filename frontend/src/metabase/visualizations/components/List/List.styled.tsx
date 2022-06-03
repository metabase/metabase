import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
`;

export const ContentContainer = styled.div`
  position: relative;
  flex: 1 0 auto;
`;

export const TableContainer = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;

  overflow-x: auto;
  overflow-y: hidden;

  padding-left: 1rem;
  padding-right: 1rem;
`;

const standardTableStyleReset = css`
  border-collapse: collapse;
  border-spacing: 0;

  width: 100%;

  font-size: 12px;
  line-height: 12px;
  text-align: left;
`;

export const Table = styled.table`
  ${standardTableStyleReset}

  border-collapse: separate;
  border-spacing: 0rem 1rem;
`;

const LIST_ROW_BORDER_RADIUS = "8px";

export const ListRow = styled.tr`
  position: relative;
  height: 4rem;
  background-color: ${color("bg-white")};
  border: 1px solid ${color("border")};

  td:first-of-type {
    border-top-left-radius: ${LIST_ROW_BORDER_RADIUS};
    border-bottom-left-radius: ${LIST_ROW_BORDER_RADIUS};

    padding-left: 1rem;
  }

  td:last-of-type {
    border-top-right-radius: ${LIST_ROW_BORDER_RADIUS};
    border-bottom-right-radius: ${LIST_ROW_BORDER_RADIUS};

    padding-right: 1rem;
  }

  &:before {
    content: "";

    position: absolute;
    left: 0;
    right: 0;

    display: block;
    height: 4rem;
    border-radius: ${LIST_ROW_BORDER_RADIUS};

    box-shadow: 4px 5px 10px 3px ${color("shadow")};
  }
`;
