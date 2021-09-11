import React, { useEffect, useMemo, useState } from "react";
import { t, ngettext, msgid } from "ttag";
import PropTypes from "prop-types";
import { getQuestionsImplicitCacheTTL } from "../../utils";
import {
  CacheTTLInput,
  CacheTTLExpandedField,
  StyledRadio,
} from "./QuestionCacheTTLField.styled";

const propTypes = {
  field: PropTypes.shape({
    value: PropTypes.number,
    onChange: PropTypes.func.isRequired,
  }).isRequired,
  question: PropTypes.object.isRequired, // metabase-lib's Question instance
};

const DEFAULT_CACHE_TTL = null;

const MODE = {
  DEFAULT: "default",
  CUSTOM: "custom",
};

function getInitialMode(question, implicitCacheTTL) {
  if (question.card().cache_ttl > 0 || !implicitCacheTTL) {
    return MODE.CUSTOM;
  }
  return MODE.DEFAULT;
}

export function QuestionCacheTTLField({ field, question, ...props }) {
  const implicitCacheTTL = useMemo(
    () => getQuestionsImplicitCacheTTL(question),
    [question],
  );

  const [mode, setMode] = useState(getInitialMode(question, implicitCacheTTL));

  useEffect(() => {
    if (mode === MODE.DEFAULT) {
      field.onChange(DEFAULT_CACHE_TTL);
    }
  }, [field, mode]);

  if (!implicitCacheTTL) {
    return <CacheTTLInput field={field} />;
  }

  return (
    <div {...props}>
      <StyledRadio
        value={mode}
        onChange={val => setMode(val)}
        options={[
          {
            name: ngettext(
              msgid`Use default (${implicitCacheTTL} hour)`,
              `Use default (${implicitCacheTTL} hours)`,
              implicitCacheTTL,
            ),
            value: MODE.DEFAULT,
          },
          { name: t`Custom`, value: MODE.CUSTOM },
        ]}
        vertical
        showButtons
      />
      {mode === MODE.CUSTOM && <CacheTTLExpandedField field={field} />}
    </div>
  );
}

QuestionCacheTTLField.propTypes = propTypes;
