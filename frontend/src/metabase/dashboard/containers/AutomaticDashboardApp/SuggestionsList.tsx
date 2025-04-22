
const RELATED_CONTENT = {
  compare: {
    get title() {
      return t`Compare`;
    },
    icon: "compare",
  },
  "zoom-in": {
    get title() {
      return t`Zoom in`;
    },
    icon: "zoom_in",
  },
  "zoom-out": {
    get title() {
      return t`Zoom out`;
    },
    icon: "zoom_out",
  },
  related: {
    get title() {
      return t`Related`;
    },
    icon: "connections",
  },
};

const SuggestionsList = ({ suggestions, section }) => (
  <Box component="ol" my="sm">
    {Object.keys(suggestions).map((s, i) => (
      <li key={i} className={CS.my2}>
        <SuggestionSectionHeading>
          {RELATED_CONTENT[s].title}
        </SuggestionSectionHeading>
        {suggestions[s].length > 0 &&
          suggestions[s].map((item, itemIndex) => (
            <Link
              key={itemIndex}
              to={item.url}
              className={cx(CS.hoverParent, CS.hoverVisibility, S.ItemLink)}
            >
              <Card className={CS.p2} hoverable>
                <Flex align="center">
                  <Icon
                    name={RELATED_CONTENT[s].icon}
                    color={color("accent4")}
                    className={CS.mr1}
                  />
                  <h4 className={CS.textWrap}>{item.title}</h4>
                  <Box ml="auto" className={CS.hoverChild}>
                    <Tooltip label={item.description}>
                      <Icon name="info_outline" color={color("bg-dark")} />
                    </Tooltip>
                  </Box>
                </Flex>
              </Card>
            </Link>
          ))}
      </li>
    ))}
  </Box>
);

const SuggestionSectionHeading = ({ children }) => (
  <h5
    style={{
      fontWeight: 900,
      textTransform: "uppercase",
      color: color("text-medium"),
    }}
    className={CS.mb1}
  >
    {children}
  </h5>
);

const SuggestionsSidebar = ({ related }) => (
  <Flex direction="column" py="md" px="xl">
    <Title py="sm" px={0} order={2}>{t`More X-rays`}</Title>
    <SuggestionsList suggestions={related} />
  </Flex>
);
