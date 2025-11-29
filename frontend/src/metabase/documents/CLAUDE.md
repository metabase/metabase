In this directory we have a rich text editor based on tiptap. We implemented custom nodes - like CardEmbedNode, FlexContainer and ResizeNode.
Also, we added custom drag'n'drop logic to handle these custom nodes. Every CardEmbedNode is wrapped into a ResizeNode to make it resizable vertically.

It is possible to drop a CardEmbedNode onto another CardEmbedNode, this leads into creating a FlexContainer that contains both CardEmbedNodes side-by-side. Result FlexContainer is wrapped into a ResizeNode.
FlexContainer should not contain more than 3 child nodes like CardEmbedNode.
