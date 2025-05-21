import cx from "classnames";
import { t } from "ttag";

import { QueryDefinition } from "metabase/admin/datamodel/components/QueryDefinition";
import { Icon, Transition, type TransitionProps } from "metabase/ui";
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

const TRANSITION: TransitionProps["transition"] = {
  in: {
    maxHeight: "150px",
  },
  out: {
    maxHeight: "0px",
  },
  transitionProperty: "max-height",
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
    <Transition mounted={isExpanded} duration={300} transition={TRANSITION}>
      {(styles) => (
        <div className={S.formulaDefinition} style={styles}>
          <QueryDefinition
            className={S.formulaDefinitionInner}
            definition={entity.definition}
            tableId={entity.table_id}
          />
        </div>
      )}
    </Transition>
  </div>
);
