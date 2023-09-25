import { renderWithProviders } from "__support__/ui";
import { SearchSidebar } from "metabase/search/components/SearchSidebar/SearchSidebar";

export const setup = ({ value = {}, onChange = jest.fn() } = {}) => {
  const defaultProps = {
    value,
    onChange,
  };

  renderWithProviders(<SearchSidebar {...defaultProps} />);
};
