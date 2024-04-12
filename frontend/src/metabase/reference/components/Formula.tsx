import cx from "classnames";
import { TransitionGroup, CSSTransition } from "react-transition-group";
import { t } from "ttag";

import { QueryDefinition } from "metabase/admin/datamodel/components/QueryDefinition";
import { Icon } from "metabase/ui";
import type { Metric, Segment } from "metabase-types/api";

import S from "./Formula.module.css";

export const Formula = ({
  type,
  entity,
  isExpanded,
  expandFormula,
  collapseFormula,
}: {
  type: "segment" | "metric";
  entity: Segment | Metric;
  isExpanded: boolean;
  expandFormula: () => void;
  collapseFormula: () => void;
}) => (
  <div
    className={cx(S.formula)}
    onClick={isExpanded ? collapseFormula : expandFormula}
  >
    <div className={S.formulaHeader}>
      <Icon name="beaker" size={24} />
      <span className={S.formulaTitle}>{t`View the ${type} formula`}</span>
    </div>
    <TransitionGroup>
      {isExpanded && (
        <CSSTransition
          key="formulaDefinition"
          classNames={{
            enter: S.formulaDefinitionEnter,
            enterActive: S.formulaDefinitionEnterActive,
            exit: S.formulaDefinitionExit,
            exitActive: S.formulaDefinitionExitActive,
          }}
          timeout={{
            enter: 300,
            exit: 300,
          }}
        >
          <div className={S.formulaDefinition}>
            <QueryDefinition
              className={S.formulaDefinitionInner}
              object={entity}
            />
          </div>
        </CSSTransition>
      )}
    </TransitionGroup>
  </div>
);
