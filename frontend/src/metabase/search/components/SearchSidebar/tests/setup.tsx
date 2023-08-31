import { render } from "__support__/ui";
import { SearchSidebar } from "metabase/search/components/SearchSidebar/SearchSidebar";

export const setup = ({ value = {}, onChangeFilters = jest.fn() } = {}) => {
  const defaultProps = {
    value,
    onChangeFilters,
  };

  render(<SearchSidebar {...defaultProps} />);
};
