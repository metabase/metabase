import React, { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import PropTypes from "prop-types";
import Radio from "metabase/components/Radio";
import { CacheTTLField } from "../CacheTTLField";
import { getQuestionsImplicitCacheTTL } from "../../utils";

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

function CacheTTLInput(props) {
  return <CacheTTLField {...props} message={t`Cache results for`} />;
}

function getInitialMode(question, implicitCacheTTL) {
  if (question.card().cache_ttl > 0 || !implicitCacheTTL) {
    return MODE.CUSTOM;
  }
  return MODE.DEFAULT;
}

export function QuestionCacheTTLField({ field, question }) {
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
    <div>
      <Radio
        value={mode}
        onChange={val => setMode(val)}
        options={[
          {
            name: `Use default (${implicitCacheTTL} hours)`,
            value: MODE.DEFAULT,
          },
          { name: t`Custom`, value: MODE.CUSTOM },
        ]}
        vertical
        showButtons
      />
      {mode === MODE.CUSTOM && <CacheTTLInput field={field} />}
    </div>
  );
}

QuestionCacheTTLField.propTypes = propTypes;
