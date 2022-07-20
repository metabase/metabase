import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { assoc, dissoc } from "icepick";
import Icon from "metabase/components/Icon";

import {
  Input,
  Grid,
  LeftHeader,
  RightHeader,
  ValueColumn,
  DeleteButton,
  AddButton,
  Title,
} from "./HttpHeaderTab.styled";

export type Headers = {
  key: string;
  value: string;
}[];

type Props = {
  headers: Headers;
  setHeaders: (contentType: Headers) => void;
};

const HttpHeaderTab: React.FC<Props> = ({ headers, setHeaders }: Props) => {
  const add = () => {
    setHeaders([...headers, { key: "", value: "" }]);
  };
  return (
    <Grid className="grid grid-cols-2">
      <LeftHeader className="py-2 pl-6 text-sm font-semibold">{t`Name`}</LeftHeader>
      <RightHeader className="flex justify-between h-full text-sm font-semibold align-center">
        <Title>{t`Value`}</Title>

        <AddButton
          className="h-full px1 bg-content hover:bg-brand hover:bg-opacity-25 hover:text-brand"
          onClick={add}
        >
          <Icon name="add" />
        </AddButton>
      </RightHeader>
      {headers.map(({ key, value }, index) => {
        const setKey = (key: string) =>
          setHeaders(assoc(headers, index, { key, value }));
        const setValue = (value: string) =>
          setHeaders(assoc(headers, index, { key, value }));
        const remove = () =>
          setHeaders(assoc(headers, index, false).filter(Boolean));
        return (
          <>
            <Header
              className="pl-6"
              key={`${index}-key`}
              placeholder={t`Header Name`}
              value={key}
              setValue={setKey}
            />
            <ValueColumn className="flex justify-between align-center">
              <Header
                className="pl-0 pr-6"
                key={`${index}-value`}
                placeholder={t`Value`}
                value={value}
                setValue={setValue}
              />
              <DeleteButton
                className="h-full px1 bg-content hover:bg-brand hover:bg-opacity-25 hover:text-brand"
                onClick={remove}
              >
                <Icon name="trash" />
              </DeleteButton>
            </ValueColumn>
          </>
        );
      })}
    </Grid>
  );
};

type InputProps = {
  className?: string;
  value: string;
  placeholder: string;
  setValue: (value: string) => void;
};

const Header: React.FC<InputProps> = ({
  className,
  value,
  setValue,
  placeholder,
}: InputProps) => {
  return (
    <Input
      className={cx(
        "w-full px1 py-1  text-gray-500 bg-opacity-25 border-transparent placeholder-text-light bg-border focus:ring-transparent focus:border-transparent sm:text-sm",
        className,
      )}
      placeholder={placeholder}
      value={value}
      onChange={e => setValue(e.target.value)}
    />
  );
};

export default HttpHeaderTab;
