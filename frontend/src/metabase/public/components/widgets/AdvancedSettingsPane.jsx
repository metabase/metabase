/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import { t } from "ttag";
import cx from "classnames";

import { getValuePopulatedParameters } from "metabase/parameters/utils/parameter-values";
import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";
import ParametersList from "metabase/parameters/components/ParametersList";
import Select, { Option } from "metabase/core/components/Select";

import { color } from "metabase/lib/colors";

import DisplayOptionsPane from "./DisplayOptionsPane";

const getIconForParameter = parameter =>
  parameter.type === "category"
    ? "string"
    : parameter.type.indexOf("date/") === 0
    ? "calendar"
    : "unknown";

const AdvancedSettingsPane = ({
  className,
  embedType,
  resource,
  resourceType,
  resourceParameters,
  embeddingParams,
  onChangeEmbeddingParameters,
  displayOptions,
  onChangeDisplayOptions,
  onUnpublish,
  pane,
  onChangePane,
  previewParameters,
  parameterValues,
  onChangeParameterValue,
}) => {
  const valuePopulatedParameters = useMemo(
    () => getValuePopulatedParameters(previewParameters, parameterValues),
    [previewParameters, parameterValues],
  );

  return (
    <div
      className={cx(className, "p4 full-height flex flex-column bg-light")}
      style={{ width: 400 }}
    >
      <Section title={t`Style`}>
        <DisplayOptionsPane
          className="pt1"
          displayOptions={displayOptions}
          onChangeDisplayOptions={onChangeDisplayOptions}
        />
      </Section>
      {embedType === "application" && (
        <Section title={t`Parameters`}>
          {resourceParameters.length > 0 ? (
            <p>{t`Which parameters can users of this embed use?`}</p>
          ) : (
            <p>{t`This ${resourceType} doesn't have any parameters to configure yet.`}</p>
          )}
          {resourceParameters.map(parameter => (
            <div key={parameter.id} className="flex align-center my1">
              <Icon
                name={getIconForParameter(parameter)}
                className="mr2"
                style={{ color: color("text-light") }}
              />
              <h3>{parameter.name}</h3>
              <Select
                className="ml-auto bg-white"
                value={embeddingParams[parameter.slug] || "disabled"}
                onChange={e =>
                  onChangeEmbeddingParameters({
                    ...embeddingParams,
                    [parameter.slug]: e.target.value,
                  })
                }
              >
                <Option icon="close" value="disabled">{t`Disabled`}</Option>
                <Option icon="pencil" value="enabled">{t`Editable`}</Option>
                <Option icon="lock" value="locked">{t`Locked`}</Option>
              </Select>
            </div>
          ))}
        </Section>
      )}
      {embedType === "application" && previewParameters.length > 0 && (
        <Section title={t`Preview Locked Parameters`}>
          <p>{t`Try passing some values to your locked parameters here. Your server will have to provide the actual values in the signed token when using this for real.`}</p>
          <ParametersList
            className="mt2"
            vertical
            parameters={valuePopulatedParameters}
            setParameterValue={onChangeParameterValue}
          />
        </Section>
      )}
      {resource.enable_embedding ? (
        <Section title={t`Danger zone`}>
          <p>{t`This will disable embedding for this ${resourceType}.`}</p>
          <Button medium warning onClick={onUnpublish}>{t`Unpublish`}</Button>
        </Section>
      ) : null}
    </div>
  );
};

const Section = ({ className, title, children }) => (
  <div className={cx(className, "mb3 pb4 border-row-divider border-medium")}>
    <h3>{title}</h3>
    {children}
  </div>
);

export default AdvancedSettingsPane;
