import { css, type Theme } from "@emotion/react";
import styled from "@emotion/styled";

import { BucketPickerPopover } from "metabase/common/components/QueryColumnPicker/BucketPickerPopover";
import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import Button from "metabase/core/components/Button";
import { color, alpha } from "metabase/lib/colors";

export const Content = styled.div`
  display: flex;
  flex: auto;
  align-items: center;
  border-radius: 6px;

  ${BucketPickerPopover.TriggerButton} {
    height: 100%;
  }
`;

export const TitleContainer = styled.div`
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
  padding: 0.5rem 0;
  flex-grow: 1;
`;

export const RemoveButton = styled(Button)`
  color: var(--mb-color-text-white);
  background-color: transparent;

  opacity: 0.6;
  transition: all 100ms;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: transparent;
    opacity: 1;
  }
`;

RemoveButton.defaultProps = {
  icon: "close",
  onlyIcon: true,
  borderless: true,
};

export const AddButton = styled(Button)`
  width: 34px;
  margin-left: 0.5rem;
  color: var(--mb-color-text-white);
  transition: none;
`;

AddButton.defaultProps = {
  icon: "add",
  onlyIcon: true,
  borderless: true,
};

export const ColumnTypeIcon = styled(QueryColumnInfoIcon)`
  color: var(--mb-color-text-medium);
`;

export const Title = styled.div`
  margin: 0 0.5rem;
  word-break: break-word;
  font-size: 0.875rem;
  font-weight: 700;
`;

const getSelectedStyle = (theme: Theme) => css`
  ${Content},
  ${ColumnTypeIcon} {
    background-color: ${theme.fn.themeColor("summarize")};
    color: var(--mb-color-text-white);
  }

  ${BucketPickerPopover.TriggerButton} {
    opacity: 1;
    color: ${alpha(theme.fn.themeColor("white"), 0.65)};
  }

  ${BucketPickerPopover.TriggerButton}:hover {
    color: var(--mb-color-text-white);
    opacity: 1;
  }
`;

const getUnselectedStyle = (theme: Theme) => css`
  ${BucketPickerPopover.TriggerButton} {
    opacity: 0;
    color: ${theme.fn.themeColor("text-light")};
  }

  ${ColumnTypeIcon} {
    color: ${theme.fn.themeColor("text-light")};
  }

  &:hover {
    ${Content},
    ${ColumnTypeIcon},
    ${AddButton} {
      color: ${theme.fn.themeColor("summarize")};
      background-color: var(--mb-color-bg-light);
    }

    ${AddButton}:hover {
      background-color: var(--mb-color-bg-medium);
    }

    ${BucketPickerPopover.TriggerButton} {
      opacity: 1;
      color: ${theme.fn.themeColor("text-light")};
    }

    ${BucketPickerPopover.TriggerButton}:hover {
      color: ${theme.fn.themeColor("text-medium")};
    }
  }
`;

export const Root = styled.li<{ isSelected: boolean }>`
  display: flex;
  align-items: stretch;
  cursor: pointer;
  margin: 0.25rem 0;
  min-height: 34px;
  position: relative;

  ${props =>
    props.isSelected
      ? getSelectedStyle(props.theme)
      : getUnselectedStyle(props.theme)}
`;
