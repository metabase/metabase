import cx from "classnames";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import { t } from "ttag";

import { QueryDefinition } from "metabase/admin/datamodel/components/QueryDefinition";
import { Icon } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import S from "./Formula.module.css";

type FormulaEntityProps = {
  type: "segment";
  entity: Segment;
};

type FormulaProps = FormulaEntityProps & {
  isExpanded: boolean;
  expandFormula: () => void;
  collapseFormula: () => void;
};

export const Formula = ({
  type,
  entity,
  isExpanded,
  expandFormula,
  collapseFormula,
}: FormulaProps) => (
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
              definition={entity.definition}
              tableId={entity.table_id}
            />
          </div>
        </CSSTransition>
      )}
    </TransitionGroup>
  </div>
);
