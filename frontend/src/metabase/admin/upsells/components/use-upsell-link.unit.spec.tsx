import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { useUpsellLink } from "./use-upsell-link";

type TestComponentProps = {
  url: string;
  campaign: string;
  location: string;
};

const TestComponent = ({ url, campaign, location }: TestComponentProps) => {
  const link = useUpsellLink({ url, campaign, location });

  return (
    <div>
      <a href={link}>Link</a>
    </div>
  );
};

const OSSFeatures = createMockTokenFeatures();
const EEFeatures = Object.fromEntries(
  Object.entries(createMockTokenFeatures()).map(([key, value]) => [
    key,
    !value,
  ]),
) as TokenFeatures;

const setup = ({
  url,
  campaign,
  location,
  oss = true,
}: TestComponentProps & { oss?: boolean }) => {
  const state = createMockState({
    settings: createMockSettingsState({
      "token-features": oss ? OSSFeatures : EEFeatures,
    }),
  });

  return renderWithProviders(
    <TestComponent url={url} campaign={campaign} location={location} />,
    { storeInitialState: state },
  );
};

describe("Upsells > useUpsellLink", () => {
  it("should return a URL with the correct query parameters", () => {
    const props = {
      url: "https://www.metabase.com/",
      campaign: "test-campaign",
      location: "test-location",
    };
    setup(props);

    const link = screen.getByText("Link");
    expect(link).toHaveAttribute(
      "href",
      `${props.url}?utm_source=product&utm_medium=upsell&utm_campaign=${props.campaign}&utm_content=${props.location}&source_plan=oss`,
    );
  });

  it("should insert correct plan information for OSS", () => {
    const props = {
      url: "https://www.metabase.com",
      campaign: "test-campaign",
      location: "test-location",
      oss: true,
    };
    setup(props);

    const link = screen.getByText("Link");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("source_plan=oss"),
    );
  });

  it("should insert correct plan information for EE", () => {
    const props = {
      url: "https://www.metabase.com",
      campaign: "test-campaign",
      location: "test-location",
      oss: false,
    };
    setup(props);

    const link = screen.getByText("Link");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("source_plan=pro-cloud"),
    );
  });
});
