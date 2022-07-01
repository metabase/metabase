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

type Props = {
  description: string;
  setDescription: (description: string) => void;

  data: any;
  setData: (data: any) => void;
};

const CreateHttpAction: React.FC<Props> = ({
  setData,
  data,
  description,
  setDescription,
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
    <CreateHttpActionInner
      description={description}
      setDescription={setDescription}
      method={method}
      setMethod={value => {
        setData({ method: value });
      }}
      url={url}
      setUrl={value => {
        setData({ url: `${protocol}://${value}` });
      }}
      protocol={protocol}
      setProtocol={value => {
        setData({ url: `${value}://${url}` });
      }}
      body={body}
      setBody={value => {
        setData({ body: value });
      }}
      headers={headers}
      setHeaders={value => {
        setHeaders(value);
        setData({
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
  setDescription: (description: string) => void;
};

const CreateHttpActionInner: React.FC<InnerProps> = ({
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
  description,
  setDescription,
}) => {
  const [currentTab, setCurrentTab] = React.useState(TABS[0].name);
  const [contentType, setContentType] = React.useState("application/json");

  return (
    <div className="grid w-full h-full grid-cols-2 md:flex-row">
      <div className="border-t border-r border-border bg-content">
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
        <div className="py-4 pl-6 pr-4 bg-white border-b border-border">
          <EditableText
            className="text-sm text-text-light"
            placeholder={t`Enter an action description...`}
            initialValue={description}
            onChange={setDescription}
          />
        </div>
      </div>
      <div className="flex flex-col border-t border-border">
        <div className="flex items-center justify-between py-1 pl-2 pr-4 border-b border-b-border">
          <div>
            <Tabs
              tabs={TABS}
              currentTab={currentTab}
              setCurrentTab={setCurrentTab}
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
        <Contents active={currentTab === "body"}>
          <BodyTab
            contentType={contentType}
            setContentType={setContentType}
            body={body}
            setBody={setBody}
          />
        </Contents>
        <Contents active={currentTab === "headers"}>
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

const TABS = [
  { name: "body", label: t`Body` },
  { name: "headers", label: t`Headers` },
];

const CONTENT_TYPE = [
  {
    value: "application/json",
    label: "JSON",
  },
];

export default CreateHttpAction;
