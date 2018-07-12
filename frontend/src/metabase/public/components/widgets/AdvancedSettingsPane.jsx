/* @flow */

import React from "react";
import { t } from "c-3po";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";
import Parameters from "metabase/parameters/components/Parameters";
import Select, { Option } from "metabase/components/Select";

import colors from "metabase/lib/colors";

import DisplayOptionsPane from "./DisplayOptionsPane";

const getIconForParameter = parameter =>
  parameter.type === "category"
    ? "string"
    : parameter.type.indexOf("date/") === 0 ? "calendar" : "unknown";

import type { EmbedType, DisplayOptions } from "./EmbedModalContent";
import type {
  EmbeddableResource,
  EmbeddingParams,
} from "metabase/public/lib/types";
import type { Parameter, ParameterId } from "metabase/meta/types/Parameter";

type Props = {
  className?: string,

  embedType: EmbedType,

  resourceType: string,
  resource: EmbeddableResource,
  resourceParameters: Parameter[],

  embeddingParams: EmbeddingParams,
  onChangeEmbeddingParameters: EmbeddingParams => void,

  displayOptions: DisplayOptions,
  previewParameters: Parameter[],
  parameterValues: { [id: ParameterId]: any },

  onChangeDisplayOptions: DisplayOptions => void,
  onChangeParameterValue: (id: ParameterId, value: any) => void,
  onUnpublish: () => Promise<void>,
};

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
}: Props) => (
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
          <p
          >{t`This ${resourceType} doesn't have any parameters to configure yet.`}</p>
        )}
        {resourceParameters.map(parameter => (
          <div className="flex align-center my1">
            <Icon
              name={getIconForParameter(parameter)}
              className="mr2"
              style={{ color: colors["text-light"] }}
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
    {embedType === "application" &&
      previewParameters.length > 0 && (
        <Section title={t`Preview Locked Parameters`}>
          <p
          >{t`Try passing some values to your locked parameters here. Your server will have to provide the actual values in the signed token when using this for real.`}</p>
          <Parameters
            className="mt2"
            vertical
            parameters={previewParameters}
            parameterValues={parameterValues}
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

const Section = ({ className, title, children }) => (
  <div className={cx(className, "mb3 pb4 border-row-divider border-med")}>
    <h3>{title}</h3>
    {children}
  </div>
);

export default AdvancedSettingsPane;
