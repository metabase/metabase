---
title: Markdown in Metabase
summary: Use Markdown to format text in Metabase dashboard cards, documents, and descriptions.
---

# Markdown in Metabase

Use Markdown in Metabase to format text, add headings and lists, and insert links and images. In Metabase, you can use Markdown in:

- Dashboard header and text cards
- Documents
- Descriptions

This page covers the most common Markdown formatting options in Metabase. For a complete Markdown reference, see [The Markdown Guide](https://www.markdownguide.org/).

> Markdown headings and links are not the same as heading cards and link cards. This page covers Markdown *headings* (text you enlarge with `#`) and Markdown *links* (clickable text you add with brackets and parentheses). Dashboards also have heading cards and link cards, which are separate features.

## Headings

To create headings, use number signs (`#`). The more number signs you use, the smaller the heading. Add a space after the number signs.

```text
# Heading 1
## Heading 2
### Heading 3
```

This renders as:

![Three headings rendered in a Metabase text card](./images/markdown-headings.png)

Metabase supports six heading levels, from `#` (largest) to `######` (smallest).

## Bold and italics

To make your text bold, wrap it in two asterisks. To make your text italic, wrap it in one asterisk. To make your text bold *and* italic, wrap it in three asterisks.

```text
**This text is bold.**
*This text is italic.*
***This text is bold and italic.***
```

This renders as:

**This text is bold.**
*This text is italic.*
***This text is bold and italic.***

## Lists

To create a bulleted list, start each line with a dash (`-`) and a space.

```text
- First item
- Second item
- Third item
```

To create a numbered list, start each line with a number, followed by a period and a space.

```text
1. First step
2. Second step
3. Third step
```

To nest a bulleted item under another bulleted item, indent the nested item with two spaces.

```text
- Fruit
  - Apple
  - Orange
- Vegetable
```

## Links

To add a link, put the link text in square brackets, followed by the URL in parentheses:

```text
[Metabase documentation](https://www.metabase.com/docs/)
```

This renders as a clickable link: [Metabase documentation](https://www.metabase.com/docs/).

## Images and GIFs

To add an image, type an exclamation point (`!`), then put the alt text in square brackets, followed by the image URL in parentheses. The alt text describes the image for users with a screen reader or those who can't load the image.

```text
![A bar chart of monthly sales](https://example.com/sales-chart.png)
```

> You can't upload an image to Metabase. Host the image somewhere else, then link to the image URL. The URL needs to be one your Metabase can access.

The same syntax works for GIFs. Just use the URL of a GIF instead of an image.

## Code

To format words as inline code, wrap them in single backticks.

```text
Filter the table by the `status` column.
```

To format a block of code, wrap it in three backticks on the lines above and below the code.

````text
```
SELECT *
FROM orders
WHERE status = 'paid'
```
````

## Blockquotes

To create a blockquote, start the line with a greater than sign (`>`) and a space.

```text
> This dashboard tracks weekly active users.
```

## Horizontal lines

To separate sections of text with a horizontal line, put three dashes (`---`) on their own line. Add a blank line before and after the dashes.

```text
Section one.

---

Section two.
```

## Markdown in documents

In a [document](../documents/introduction.md), Metabase formats your text as you type instead of showing the raw Markdown. A few things to know:

- Type `/` to open a menu of formatting options.
- When you paste a URL, Metabase turns it into a clickable link automatically.
- To add an image, start the image on its own line. Type the closing parenthesis instead of pasting it.