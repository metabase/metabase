/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import MethodSelector from "./MethodSelector";
import Tabs from "./Tabs";
import HttpHeaderTab, { Headers } from "./HttpHeaderTab";
import BodyTab from "./BodyTab";
import UrlInput from "./UrlInput";
import CompactSelect from "./CompactSelect";
import ParametersTab from "./ParametersTab";
import { TemplateTags } from "metabase-types/types/Query";

import {
  BodyContainer,
  Tab,
  PersistentTab,
  EditableText,
  Description,
  Grid,
  LeftColumn,
  LeftTabs,
  MethodContainer,
  RightColumn,
  RightTabs,
  UrlContainer,
} from "./HttpAction.styled";
import ResponseTab from "./ResponseTab";

type Props = {
  description: string;
  onDescriptionChange: (description: string) => void;

  data: any;
  onDataChange: (data: any) => void;

  templateTags: TemplateTags;
  onTemplateTagsChange: (templateTags: TemplateTags) => void;

  responseHandler: string;
  onResponseHandlerChange: (responseHandler: string) => void;

  errorHandler: string;
  onErrorHandlerChange: (errorHandler: string) => void;
};

const HttpAction: React.FC<Props> = ({
  onDataChange,
  data,
  templateTags,
  description,
  onDescriptionChange,
  onTemplateTagsChange,
  responseHandler,
  onResponseHandlerChange,
  errorHandler,
  onErrorHandlerChange,
}) => {
  const { protocol, url, method, initialHeaders, body } = React.useMemo(() => {
    const [protocol, url] = (data.url || "https://").split("://", 2);
    const initialHeaders: Headers = Object.entries(
      (typeof data.headers === "string"
        ? JSON.parse(data.headers)
        : data.headers) || {},
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
      responseHandler={responseHandler}
      onResponseHandlerChange={onResponseHandlerChange}
      errorHandler={errorHandler}
      onErrorHandlerChange={onErrorHandlerChange}
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

  responseHandler: string;
  onResponseHandlerChange: (errorHandler: string) => void;

  errorHandler: string;
  onErrorHandlerChange: (errorHandler: string) => void;

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
  responseHandler,
  onResponseHandlerChange,
  errorHandler,
  onErrorHandlerChange,
}) => {
  const [currentParamTab, setCurrentParamTab] = React.useState(
    PARAM_TABS[0].name,
  );
  const [currentConfigTab, setCurrentConfigTab] = React.useState(
    CONFIG_TABS[0].name,
  );
  const [contentType, setContentType] = React.useState("application/json");
  return (
    <Grid>
      <LeftColumn>
        <MethodContainer>
          <MethodSelector value={method} setValue={setMethod} />
        </MethodContainer>
        <UrlContainer>
          <UrlInput
            url={url}
            setUrl={setUrl}
            protocol={protocol}
            setProtocol={setProtocol}
          />
        </UrlContainer>
        <Description>
          <EditableText
            className="text-sm text-light"
            placeholder={t`Enter an action description...`}
            initialValue={description}
            onChange={onDescriptionChange}
          />
        </Description>
        <BodyContainer>
          <LeftTabs>
            <Tabs
              tabs={PARAM_TABS}
              currentTab={currentParamTab}
              setCurrentTab={setCurrentParamTab}
            />
          </LeftTabs>
          <Tab>
            <ParametersTab
              templateTags={templateTags}
              onTemplateTagsChange={onTemplateTagsChange}
            />
          </Tab>
        </BodyContainer>
      </LeftColumn>
      <RightColumn>
        <RightTabs>
          <div>
            <Tabs
              tabs={CONFIG_TABS}
              currentTab={currentConfigTab}
              setCurrentTab={setCurrentConfigTab}
            />
          </div>
          <div>
            <CompactSelect
              options={CONTENT_TYPE}
              value={contentType}
              onChange={(value: string) => setContentType(value)}
            />
          </div>
        </RightTabs>
        <PersistentTab active={currentConfigTab === "body"}>
          <BodyTab
            contentType={contentType}
            setContentType={setContentType}
            body={body}
            setBody={setBody}
          />
        </PersistentTab>
        <PersistentTab active={currentConfigTab === "headers"}>
          <HttpHeaderTab headers={headers} setHeaders={setHeaders} />
        </PersistentTab>
        <PersistentTab active={currentConfigTab === "response"}>
          <ResponseTab
            responseHandler={responseHandler}
            onResponseHandlerChange={onResponseHandlerChange}
            errorHandler={errorHandler}
            onErrorHandlerChange={onErrorHandlerChange}
          />
        </PersistentTab>
      </RightColumn>
    </Grid>
  );
};

const CONFIG_TABS = [
  { name: "body", label: t`Body` },
  { name: "headers", label: t`Headers` },
  { name: "response", label: t`Response` },
];

const PARAM_TABS = [{ name: "params", label: t`Parameters` }];

const CONTENT_TYPE = [
  {
    value: "application/json",
    name: "JSON",
  },
];

export default HttpAction;
