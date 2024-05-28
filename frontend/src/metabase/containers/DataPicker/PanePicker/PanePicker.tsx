import type * as React from "react";
import { t } from "ttag";

import { Tree } from "metabase/components/tree";
import type { ITreeNodeItem } from "metabase/components/tree/types";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import {
  Root,
  LeftPaneContainer,
  TreeContainer,
  BackButton,
  RightPaneContainer,
} from "./PanePicker.styled";

interface PanePickerProps {
  data: ITreeNodeItem[];
  selectedId?: ITreeNodeItem["id"];
  onSelect: (item: ITreeNodeItem) => void;
  onBack?: () => void;
  children?: React.ReactNode;
}

function PanePicker({
  data,
  selectedId,
  onSelect,
  onBack,
  children,
}: PanePickerProps) {
  const hasContent = data.length > 0;
  return (
    <Root>
      <LeftPaneContainer hasContent={hasContent}>
        {onBack && (
          <BackButton onClick={onBack}>
            <Icon name="chevronleft" className={CS.mr1} />
            {t`Back`}
          </BackButton>
        )}
        <TreeContainer>
          <Tree selectedId={selectedId} data={data} onSelect={onSelect} />
        </TreeContainer>
      </LeftPaneContainer>
      <RightPaneContainer>{children}</RightPaneContainer>
    </Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PanePicker;
