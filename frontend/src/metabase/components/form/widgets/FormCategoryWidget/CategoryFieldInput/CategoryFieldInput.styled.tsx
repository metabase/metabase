import styled from "@emotion/styled";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";

import { color, darken } from "metabase/lib/colors";

export const OptionListContainer = styled.div`
  max-height: 200px;
`;

export const StyledFieldValuesWidget = styled(FieldValuesWidget)`
  border: 1px solid ${darken("border", 0.1)};
  border-radius: 4px;
  padding: 0;
  font-weight: 700;
  font-size: 1rem;
  height: 45.5px;

  .TokenField--focused {
    border-color: ${color("brand")};
  }

  .TokenField-ItemWrapper {
    background-color: transparent;
    color: ${color("text-dark")};

    padding-left: 12px;
    padding-top: 0;
    padding-right: 0;
    padding-bottom: 0;
    margin: 0;

    span {
      padding: 0;
    }
  }

  .TokenField-NewItemInputContainer {
    height: 100%;
    padding: 12px;
    margin: 0;

    input {
      color: ${color("text-dark")};
      padding: 0;
      margin: 0;
    }
  }

  &:hover {
    border-color: ${color("brand")};
    transition: border 300ms ease-in-out;
  }
`;

export const FieldValuesWidgetContainer = styled.div`
  .TokenField--focused {
    border-color: ${color("brand")};
  }
`;
