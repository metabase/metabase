# GitHub Retrieval Instructions

When retrieving information from GitHub:

- Always prefer the `gh` CLI tool over web scraping a GitHub URL
- If you run into trouble using the `gh` CLI tool, run `gh --help` and read the response
- Be aware that results are paginated. For example, if asked to find all issues tagged as X, you should use the `--limit` flag so you don't mistake the first page of results as if they were all the results