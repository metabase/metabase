---
title: Format text with Markdown
summary: How to add headings, lists, code blocks, images, and more to dashboard cards and documents using Markdown syntax.
---

# Format text with Markdown

Use Markdown in Metabase to format text, add headings and lists, and insert links and images. In Metabase, you can use Markdown in:

- Dashboard header and text cards
- Documents
- Descriptions (for entities like questions and dashboards)

Metabase uses GitHub Flavored Markdown.

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

Markdown headings aren't the same as dashboard heading cards. Headings here are text you enlarge with `#`. Heading cards are a separate dashboard feature.

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

To create an unordered list, start each line with a dash (`-`) and a space.

```text
- Franz Kafka
- Jorge Luis Borges
- Ursula K. Le Guin
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
[the internet's finest webpage](https://www.metabase.com)
```

This renders as a clickable link: [the internet's finest webpage](https://www.metabase.com).

Markdown links aren't the same as [dashboard link cards](../dashboards/introduction.md#link-cards), which are a separate dashboard feature for linking to other items in your Metabase.

## Images and GIFs

![Cat GIF](images/markdown-cat.gif)

To add an image, type an exclamation point (`!`), then a description of the image in square brackets, then the image URL in parentheses. That description is called alt text. It appears if the image can't load, and screen readers read it aloud.

```text
![A cat wearing a tiny hat](https://example.com/cat-in-hat.png)
```

You can't upload an image to Metabase. Link to an image that's already online, using a URL your Metabase can access. Your admin can also [restrict which domains images load from](../configuring-metabase/settings.md#allowed-domains-for-images).

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
> Every number is fine until someone asks how it was calculated.
```

## Horizontal lines

To separate sections of text with a horizontal line, put three dashes (`---`) on their own line. Add a blank line before and after the dashes.

```text
Section one.

---

Section two.
```

## Markdown in documents

In a [document](../documents/introduction.md), Metabase formats your text as you type instead of showing the raw Markdown. If something doesn't format the way you expect, try retyping the last character or two to trigger the conversion.

- Type `/` to open a menu of formatting options.
- When you paste a URL, Metabase turns it into a clickable link automatically.
- To add an image, start the image on its own line. Type the closing parenthesis instead of pasting it.

## Further reading

- [The Markdown Guide](https://www.markdownguide.org/) for complete Markdown syntax