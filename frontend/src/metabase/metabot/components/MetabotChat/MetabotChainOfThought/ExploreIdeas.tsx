import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import type { ExploreIdea } from "metabase/api/ai-streaming/schemas";
import Animation from "metabase/css/core/animation.module.css";
import { Icon, Loader, Text } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";

const IdeaStatusIcon = ({ status }: { status: ExploreIdea["status"] }) => {
  if (status === "considering") {
    return <Loader size={10} className={S.resultIcon} />;
  }
  return status === "kept" ? (
    <Icon name="check" size={12} c="success" className={S.resultIcon} />
  ) : (
    <Icon name="close" size={12} c="text-tertiary" className={S.resultIcon} />
  );
};

const IdeaRow = ({
  idea,
  index,
  animate,
}: {
  idea: ExploreIdea;
  index: number;
  animate: boolean;
}) => (
  <div
    className={cx(
      S.resultRow,
      S.ideaRow,
      idea.status === "dropped" && S.ideaDropped,
      animate && Animation.fadeIn,
    )}
    style={
      animate ? { animationDelay: `${Math.min(index * 30, 360)}ms` } : undefined
    }
    data-testid="metabot-explore-idea"
    data-status={idea.status}
  >
    <IdeaStatusIcon status={idea.status} />
    <Text component="span" className={S.resultName} c="inherit" lh="inherit">
      {idea.prompt}
    </Text>
    {idea.reason && (
      <Text component="span" className={S.resultContext} lh="inherit">
        {idea.reason}
      </Text>
    )}
  </div>
);

export const exploreIdeasCount = (ideas: ExploreIdea[]) => {
  const kept = ideas.filter((idea) => idea.status === "kept").length;
  return ideas.some((idea) => idea.status === "considering")
    ? t`weighing ${ideas.length} ideas`
    : t`kept ${kept} of ${ideas.length}`;
};

export const ExploreIdeasList = ({
  ideas,
  done,
  animate,
}: {
  ideas: ExploreIdea[];
  done: boolean;
  animate: boolean;
}) => {
  // Rows flip in place while Jev decides; once settled, what was kept reads first.
  const rows = done
    ? _.sortBy(ideas, (idea) => (idea.status === "kept" ? 0 : 1))
    : ideas;
  return (
    <div className={cx(S.resultsList, S.nested)}>
      {rows.map((idea, i) => (
        <IdeaRow key={idea.prompt} idea={idea} index={i} animate={animate} />
      ))}
    </div>
  );
};
