import React from "react";
import { t } from "ttag";
import cx from "classnames";

import MethodSelector from "./MethodSelector";
import Tabs from "./Tabs";
import HttpHeaderTab, { Headers } from "./HttpHeaderTab";
import BodyTab from "./BodyTab";
import UrlInput from "./UrlInput";
import Selector from "./Selector";

type Props = {};

const CreateActionPage: React.FC<Props> = props => {
  const [method, setMethod] = React.useState("GET");
  const [contentType, setContentType] = React.useState("application/json");
  const [currentTab, setCurrentTab] = React.useState(TABS[0].name);
  const [url, setUrl] = React.useState("");
  const [protocol, setProtocol] = React.useState("https");
  const [body, setBody] = React.useState("");
  const [headers, setHeaders] = React.useState<Headers>([]);

  return (
    <div className="grid w-full h-full grid-cols-2 md:flex-row">
      <div className="border-t border-r border-border bg-content">
        <div className="px-6 py-2 border-b border-b-border">
          <MethodSelector value={method} setValue={setMethod} />
        </div>
        <div className="py-4 border-b border-border">
          <UrlInput
            protocol={protocol}
            setProtocol={setProtocol}
            url={url}
            setUrl={setUrl}
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

export default CreateActionPage;
