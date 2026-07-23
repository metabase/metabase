import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { TOOL_MESSAGES } from "metabase/metabot/constants";
import { Collapse, Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";
import { SearchResultsList } from "./SearchResults";
import { SEARCH_TOOL_NAME } from "./constants";
import {
  type ToolChainStep,
  activeToolLabel,
  doneToolLabel,
  renderTitle,
  searchResultCount,
  specificLabel,
} from "./utils";

const toolLabelContent = (step: ToolChainStep, done: boolean) => {
  // search reads "Searching for orders" / "Searched for orders", trailed by a
  // muted result count once the hits are in
  if (step.name === SEARCH_TOOL_NAME) {
    const label =
      specificLabel(step, done) ?? (done ? t`Searched` : t`Searching`);
    return (
      <>
        {renderTitle(label)}
        {step.searchResults && (
          <span className={S.resultCount}>
            {searchResultCount(step.searchResults)}
          </span>
        )}
      </>
    );
  }
  const specific = specificLabel(step, done);
  if (specific) {
    return renderTitle(specific);
  }
  return done ? doneToolLabel(step.name) : activeToolLabel(step.name);
};

const ToolStepLabel = ({
  step,
  done,
  className,
}: {
  step: ToolChainStep;
  done: boolean;
  className?: string;
}) => (
  <Text component="span" className={className} c="inherit" lh="inherit">
    {toolLabelContent(step, done)}
  </Text>
);

// a burst of near-instant read_resource calls, collapsed into one row
export const ResourceGroupStep = ({
  count,
  done,
}: {
  count: number;
  done: boolean;
}) => (
  <div className={S.toolStep}>
    <div className={cx(S.toolRow, S.toolRowStatic)}>
      <Text component="span" c="inherit">
        {done
          ? TOOL_MESSAGES.read_resource.done(count)
          : TOOL_MESSAGES.read_resource.active(count)}
      </Text>
    </div>
  </div>
);

// a tool step is itself a collapse: the label is always shown, its results (search
// hits) stay hidden until the row is expanded
export const ToolStep = ({
  step,
  done,
  animate,
}: {
  step: ToolChainStep;
  done: boolean;
  animate: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const hasResults = !!step.searchResults?.results.length;

  return (
    <div className={S.toolStep}>
      <UnstyledButton
        className={cx(S.toolRow, !hasResults && S.toolRowStatic)}
        component={hasResults ? "button" : "div"}
        aria-expanded={hasResults ? open : undefined}
        onClick={hasResults ? () => setOpen((prev) => !prev) : undefined}
      >
        <ToolStepLabel step={step} done={done} />
        {hasResults && (
          <Icon
            name="chevronright"
            size={10}
            className={cx(S.chevron, open && S.chevronOpen)}
          />
        )}
      </UnstyledButton>
      {hasResults && (
        <Collapse in={open}>
          <SearchResultsList step={step} animate={animate} />
        </Collapse>
      )}
    </div>
  );
};
