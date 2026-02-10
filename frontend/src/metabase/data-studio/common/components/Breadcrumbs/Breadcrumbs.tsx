import { Fragment } from "react";
import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Flex, Group, Text } from "metabase/ui";

import S from "./Breadcrumbs.module.css";

export type BreadcrumbItem = {
  label: string;
  to?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <Group c="text-secondary" gap="sm" wrap="nowrap" px="lg" pt="md">
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && <Separator />}
          {item.to ? (
            <BreadcrumbLink to={item.to}>
              <Ellipsified>{item.label}</Ellipsified>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbText>
              <Ellipsified>{item.label}</Ellipsified>
            </BreadcrumbText>
          )}
        </Fragment>
      ))}
    </Group>
  );
}

function BreadcrumbLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} className={S.link}>
      <Flex align="center" gap="xs" wrap="nowrap">
        {children}
      </Flex>
    </Link>
  );
}

function BreadcrumbText({ children }: { children: React.ReactNode }) {
  return (
    <Flex align="center" gap="xs" wrap="nowrap">
      {children}
    </Flex>
  );
}

function Separator() {
  return <Text span>/</Text>;
}
