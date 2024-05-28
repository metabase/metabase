import PropTypes from "prop-types";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { duration } from "metabase/lib/formatting";

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

function QuestionCacheTTLField({ field, question, ...props }) {
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

  // implicitCacheTTL is in seconds and duration works with milliseconds
  const defaultCachingLabel = duration(implicitCacheTTL * 1000);

  return (
    <div {...props}>
      <StyledRadio
        value={mode}
        onChange={val => setMode(val)}
        options={[
          {
            name: t`Use default` + ` (${defaultCachingLabel})`,
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

export default QuestionCacheTTLField;
