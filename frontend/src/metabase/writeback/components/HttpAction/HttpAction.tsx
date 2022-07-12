import React from "react";
import { t } from "ttag";
import cx from "classnames";

import MethodSelector from "./MethodSelector";
import Tabs from "./Tabs";
import HttpHeaderTab, { Headers } from "./HttpHeaderTab";
import BodyTab from "./BodyTab";
import UrlInput from "./UrlInput";
import Selector from "./Selector";
import EditableText from "metabase/core/components/EditableText";
import ParametersTab from "./ParametersTab";
import { TemplateTags } from "metabase-types/types/Query";

type Props = {
  description: string;
  onDescriptionChange: (description: string) => void;

  data: any;
  onDataChange: (data: any) => void;

  templateTags: TemplateTags;
  onTemplateTagsChange: (templateTags: TemplateTags) => void;
};

const HttpAction: React.FC<Props> = ({
  onDataChange,
  data,
  templateTags,
  description,
  onDescriptionChange,
  onTemplateTagsChange,
}) => {
  const { protocol, url, method, initialHeaders, body } = React.useMemo(() => {
    const [protocol, url] = (data.url || "https://").split("://", 2);
    const initialHeaders: Headers = Object.entries(
      data.headers || {},
    ).map(([key, value]) => ({ key, value: value as string }));
    return {
      protocol,
      url,
      method: data.method || "GET",
      initialHeaders,
      body: data.body,
    };
  }, [data]);
  const [headers, setHeaders] = React.useState<Headers>(initialHeaders);

  return (
    <HttpActionInner
      description={description}
      onDescriptionChange={onDescriptionChange}
      templateTags={templateTags}
      onTemplateTagsChange={onTemplateTagsChange}
      method={method}
      setMethod={value => {
        onDataChange({ method: value });
      }}
      url={url}
      setUrl={value => {
        onDataChange({ url: `${protocol}://${value}` });
      }}
      protocol={protocol}
      setProtocol={value => {
        onDataChange({ url: `${value}://${url}` });
      }}
      body={body}
      setBody={value => {
        onDataChange({ body: value });
      }}
      headers={headers}
      setHeaders={value => {
        setHeaders(value);
        onDataChange({
          headers: Object.fromEntries(
            value.map(({ key, value }) => [key, value]),
          ),
        });
      }}
    />
  );
};

type InnerProps = {
  method: string;
  setMethod: (newValue: string) => void;

  url: string;
  setUrl: (newValue: string) => void;

  protocol: string;
  setProtocol: (newValue: string) => void;

  body: string;
  setBody: (newValue: string) => void;

  headers: Headers;
  setHeaders: (newValue: Headers) => void;

  description: string;
  onDescriptionChange: (description: string) => void;

  templateTags: TemplateTags;
  onTemplateTagsChange: (templateTags: TemplateTags) => void;
};

const HttpActionInner: React.FC<InnerProps> = ({
  method,
  setMethod,
  url,
  setUrl,
  protocol,
  setProtocol,
  body,
  setBody,
  headers,
  setHeaders,
  templateTags,
  description,
  onDescriptionChange,
  onTemplateTagsChange,
}) => {
  const [currentParamTab, setCurrentParamTab] = React.useState(
    PARAM_TABS[0].name,
  );
  const [currentConfigTab, setCurrentConfigTab] = React.useState(
    CONFIG_TABS[0].name,
  );
  const [contentType, setContentType] = React.useState("application/json");
  return (
    <div className="grid w-full h-full grid-cols-2 md:flex-row">
      <div className="flex flex-column border-t border-r border-border bg-content">
        <div className="px-6 py-2 border-b border-b-border">
          <MethodSelector value={method} setValue={setMethod} />
        </div>
        <div className="py-4 border-b border-border">
          <UrlInput
            url={url}
            setUrl={setUrl}
            protocol={protocol}
            setProtocol={setProtocol}
          />
        </div>
        <div className="flex flex-column flex-grow bg-white border-b border-border">
          <div className="pl-4 pr-4 border-b border-border">
            <Tabs
              tabs={PARAM_TABS}
              currentTab={currentParamTab}
              setCurrentTab={setCurrentParamTab}
            />
          </div>
          <div className="flex-grow">
            <ParametersTab
              templateTags={templateTags}
              onTemplateTagsChange={onTemplateTagsChange}
            />
          </div>
        </div>
        <div className="py-4 pl-6 pr-4 bg-white">
          <EditableText
            className="text-sm text-light"
            placeholder={t`Enter an action description...`}
            initialValue={description}
            onChange={onDescriptionChange}
          />
        </div>
      </div>
      <div className="flex flex-column border-t border-border">
        <div className="flex align-center justify-between py-1 pl-2 pr-4 border-b border-b-border">
          <div>
            <Tabs
              tabs={CONFIG_TABS}
              currentTab={currentConfigTab}
              setCurrentTab={setCurrentConfigTab}
            />
          </div>
          <div>
            <Selector
              options={CONTENT_TYPE}
              value={contentType}
              setValue={value => setContentType(value)}
            />
          </div>
        </div>
        <Contents active={currentConfigTab === "body"}>
          <BodyTab
            contentType={contentType}
            setContentType={setContentType}
            body={body}
            setBody={setBody}
          />
        </Contents>
        <Contents active={currentConfigTab === "headers"}>
          <HttpHeaderTab headers={headers} setHeaders={setHeaders} />
        </Contents>
      </div>
    </div>
  );
};

const Contents: React.FC<{ active: boolean }> = ({ active, children }) => {
  return (
    <div className={cx("flex-grow", active ? "" : "hidden")}>{children}</div>
  );
};

const CONFIG_TABS = [
  { name: "body", label: t`Body` },
  { name: "headers", label: t`Headers` },
];

const PARAM_TABS = [{ name: "params", label: t`Parameters` }];

const CONTENT_TYPE = [
  {
    value: "application/json",
    label: "JSON",
  },
];

export default HttpAction;
