import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import { Table } from "./Table";

export const StyledTable = styled(Table)`
  width: 100%;
  border-collapse: unset;
  border-spacing: 0;
  margin-block: 1rem;
  position: relative;
  border-radius: 0.5rem;
  border: 1px solid ${color("border")};

  th {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid ${color("border")};
  }

  tbody {
    width: 100%;
    max-height: 600px;
    overflow-y: auto;
  }

  tbody > tr:hover {
    background-color: ${color("brand-lighter")};
  }

  td {
    border-bottom: 1px solid ${color("border")};
    padding-inline: 0.5rem;
  }

  &:first-of-type td,
  th {
    padding-inline-start: 1rem;
  }
` as typeof Table;
// we have to cast this because emotion messes up the generic types here
// see https://github.com/emotion-js/emotion/issues/2342
