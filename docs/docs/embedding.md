# <kicanvas-embed\>: The KiCanvas embedded viewer element

<!-- load kicanvas -->

<script type="module" src="/kicanvas/kicanvas.js"></script>

!!! warning "Work in progress"

    KiCanvas is in **alpha**. This is a proposed API with an incomplete implementation. Everything here is subject to change and you should be cautious if using it on your own web page.

The `<kicanvas-embed>` HTML element embeds one or more KiCad documents onto the page:

```html
<kicanvas-embed src="my-schematic.kicad_sch"></kicanvas-embed>
```

<kicanvas-embed src="/examples/simple.kicad_sch"></kicanvas-embed>

The above example shows the most basic usage of the `<kicanvas-embed>` element. It's usage is intentionally similar to the [`<video>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video) and [`<img>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img) elements. Through the use of additional [attributes](#attributes) you can control how the document is displayed, control interactivity, and load multiple files.

!!! note

    This page's format is modeled after MDN's [HTML elements reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element). It's intended to be familiar to web developers.

## Installation

During alpha, the best way to install KiCanvas is to [download the bundled kicanvas.js](/kicanvas/kicanvas.js), copy it into your project, and include it with a script tag:

```html
<script type="module" src="/kicanvas.js"></script>
```

## Examples

### Interactivity

This example embeds a single document and enables only basic controls- such as pan, zoom, select, & download:

```html
<kicanvas-embed src="my-schematic.kicad_sch" controls="basic"> </kicanvas-embed>
```

<kicanvas-embed src="/examples/simple.kicad_sch" controls="basic"></kicanvas-embed>

Using `controls="full"`, the viewer gains the sidebar and info panels:

```html
<kicanvas-embed src="my-schematic.kicad_sch" controls="full"> </kicanvas-embed>
```

<kicanvas-embed src="/examples/simple.kicad_sch" controls="full"></kicanvas-embed>

You can disable specific controls and panels using `controlslist`. This example hides the download button:

```html
<kicanvas-embed
    src="my-schematic.kicad_sch"
    controls="basic"
    controlslist="nodownload">
</kicanvas-embed>
```

<kicanvas-embed src="/examples/simple.kicad_sch" controls="basic" controlslist="nodownload"></kicanvas-embed>

### Deep linking

!!! warning "Not yet implemented"

    This functionality hasn't been implemented yet

This example shows that if you give the `<kicanvas-embed>` element an `id`, you can deep link into it using `#[id]:[reference]`:

```html
<kicanvas-embed id="my-schematic" src="my-schematic.kicad_sch" controls="basic">
</kicanvas-embed>

<a href="#my-schematic:Q101">Link to Q101</a>
```

### Multiple files

This example shows how to use `<kicanvas-source>` to load multiple files.

```html
<kicanvas-embed controls="full">
    <kicanvas-source src="project.kicad_prj"></kicanvas-source>
    <kicanvas-source src="schematic1.kicad_sch"></kicanvas-source>
    <kicanvas-source src="schematic2.kicad_sch"></kicanvas-source>
    <kicanvas-source src="board.kicad_pcb"></kicanvas-source>
</kicanvas-embed>
```

<kicanvas-embed controls="full">
    <kicanvas-source src="/examples/simple.kicad_sch"></kicanvas-source>
    <kicanvas-source src="/examples/starfish.kicad_pcb"></kicanvas-source>
</kicanvas-embed>

You can switch between the displayed files using the project panel on the right side. Note that if the files are all part of the same project, then the root schematic will be shown by default. If they are unrelated, the first schematic will be shown.

### Inline source

This example shows how to use `<kicanvas-source>` along with inline KiCad data. In this case, it's a symbol copied from a schematic and pasted into the HTML source:

```html
<kicanvas-embed>
    <!-- Use it directly -->
    <kicanvas-source>
        (kicad_sch (version 20230121) (generator eeschema) (uuid
        5d5ad125-5ef1-42a1-a410-a0c4ab262ca6) (paper "A4") (title_block (title
        "KiCanvas inline sources") (date "2023-11-11") ) (lib_symbols ) (text
        "Hello World !!!" (at 90 100 0) (effects (font (size 5 5) (thickness 1)
        bold) (justify left bottom)) (uuid 27eb63d7-7111-4c0e-9985-c1ed90138e31)
        ) (sheet_instances (path "/" (page "1")) ) )
    </kicanvas-source>

    <!-- Or mixed with `src` tag -->
    <kicanvas-source src="/examples/simple.kicad_sch"></kicanvas-source>
</kicanvas-embed>
```

<kicanvas-embed controls="full">
    <kicanvas-source src="/examples/simple.kicad_sch"></kicanvas-source>
    <kicanvas-source name="inline.kicad_sch">
        (kicad_sch (version 20230121) (generator eeschema) (uuid
        5d5ad125-5ef1-42a1-a410-a0c4ab262ca6) (paper "A4") (title_block (title
        "KiCanvas inline sources") (date "2023-11-11") ) (lib_symbols ) (text
        "Inline source file" (at 90 100 0) (effects (font (size 5 5) (thickness 1)
        bold) (justify left bottom)) (uuid 27eb63d7-7111-4c0e-9985-c1ed90138e31)
        ) (sheet_instances (path "/" (page "1")) ) )
    </kicanvas-source>
</kicanvas-embed>

## Attributes

!!! warning "Not yet implemented"

    Attributes marked with a ⚠️ are either not yet implemented or not completely implemented.

- `controls` - determines if the document is interactive (pan, zoom, etc.) and which controls are available.
    - `none` - document is not interactive and behaves like an `<img>` (default)
    - `basic` - zoom, pan, and select are available.
    - `full` - complete interactive viewer, including side panels.
- `controlslist` - further customizes the available controls.
    - `nooverlay` - don't show the "click or tap to interact" overlay.
    - `nofullscreen` - don't show the fullscreen button. ⚠️
    - `nodownload` - don't show the download button.
    - `download` - show the download button when used with controls="none".
    - `noflipview` - don't show the flip board button.
    - `flipview` - show the flip board button when used with controls="none".
    - `nosymbols` - don't show the schematic symbols panel. ⚠️
    - `nofootprints` - don't show the board footprints panel. ⚠️
    - `noobjects` - don't show the board objects panel. ⚠️
    - `noproperties` - don't show the selection properties panel. ⚠️
    - `noinfo` - don't show the document info panel. ⚠️
    - `nopreferences` - don't show the user preferences panel. ⚠️
    - `nohelp` - don't show the help panel. ⚠️
- `src` - the URL of the document to embed. If you want to show multiple documents within a single viewer, you can use multiple child `<kicanvas-source>` elements.
- `type` - when providing the file source inline, this explicitly sets the file type. If not specified, KiCanvas will attempt to determine the type automatically. If specified, it should be one of `schematic`, `board`, `project`, or `worksheet`.
- `name` - when providing the file source inline, this explicitly sets the file name. This is typically only necessary when there are multiple files within a project, as KiCad uses the file name to link schematic sheets, drawing sheets, and PCBs together. If unspecified, KiCanvas will generate a file name like `inline_0.kicad_sch`.
- `theme` - sets the color theme to use, valid values are `kicad` and `witchhazel`. ⚠️
- `zoom` - sets the initial view into the document. ⚠️
    - `objects` - zooms to show all visible objects (default). ⚠️
    - `page` - zooms to show the entire page. ⚠️
    - `x y w h` - zooms to the given area, similar to the SVG `viewBox` attribute. For example, `10 10 100 100`. ⚠️
    - `<list of references>` - zooms to include the given symbols or footprints. For example `C101 D101 Q101`. ⚠️

## Events

| Event Name                  | Fired When                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `kicanvas:select`           | The user selects a footprint (board) or symbol (schematic) within the document.                   |
| `kicanvas:deselect`         | The current selection is cleared (e.g. the user clicks empty space).                              |
| ⚠️`kicanvas:click`          | The user clicks or taps within the embedded document                                              |
| ⚠️`kicanvas:documentchange` | The currently displayed document is changed, either through user interaction or programmatically. |
| ⚠️`kicanvas:error`          | An error occurs while loading source files                                                        |
| ⚠️`kicanvas:load`           | All sources files have been successfully loaded                                                   |
| ⚠️`kicanvas:loadstart`      | KiCanvas begins loading source files                                                              |

### Selection events

When the user selects a footprint on a board or a symbol on a schematic, the
`<kicanvas-embed>` element dispatches a `kicanvas:select` [`CustomEvent`](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
The event bubbles and is `composed`, so it crosses shadow-DOM boundaries and can
be handled by listening directly on the `<kicanvas-embed>` element (or any
ancestor). When the selection is cleared, a `kicanvas:deselect` event is
dispatched instead.

The `kicanvas:select` event's `detail` has the following shape:

```ts
interface KiCanvasSelectDetail {
    // "footprint" for board footprints, "symbol" for schematic symbols.
    itemType: "footprint" | "symbol";
    // The item's reference designator (e.g. "R1", "U3"), or null.
    reference: string | null;
    // The item's value (e.g. "10k", "ATmega328"), or null.
    value: string | null;
    // The item's full property/field map, so you can read metadata such as
    // MPN, Manufacturer, or Datasheet.
    fields: Record<string, string>;
    // The sheet the item belongs to, when known.
    sheet?: string;
}
```

`kicanvas:deselect` carries no `detail`.

Example: read the selected part's MPN whenever the user clicks a footprint or
symbol.

```html
<kicanvas-embed id="viewer" src="my-board.kicad_pcb" controls="basic">
</kicanvas-embed>

<script type="module">
    const viewer = document.getElementById("viewer");

    viewer.addEventListener("kicanvas:select", (e) => {
        const { itemType, reference, value, fields, sheet } = e.detail;
        console.log(`Selected ${itemType} ${reference} (${value})`);
        console.log("MPN:", fields["MPN"] ?? "(none)");
        console.log("Manufacturer:", fields["Manufacturer"] ?? "(none)");
        if (sheet) {
            console.log("On sheet:", sheet);
        }
    });

    viewer.addEventListener("kicanvas:deselect", () => {
        console.log("Selection cleared");
    });
</script>
```

## Methods

### selectReference()

`selectReference(reference, options?)` selects the schematic symbol with the
given reference designator and zooms to it. If the symbol is on another sheet,
the viewer switches to that sheet first. A sheet placed more than once is
matched per placement, so `R101` opens the placement where that symbol is
`R101` rather than the first placement of the same sheet file.

```ts
selectReference(reference: string, options?: { zoom?: boolean }): Promise<boolean>;
```

- `reference` - the reference designator, e.g. `"R12"`. Case-sensitive.
- `options.zoom` - zoom to the selection (default `true`).

It waits for the sources to finish loading, so it can be called right after
the element is created. It resolves `true` once the symbol is selected and
`false` when no schematic page shows that reference. Calls run one at a time
in the order they were made.

A successful call dispatches `kicanvas:select`, just as a click would. A host
that opens a part when `kicanvas:select` fires and calls `selectReference()`
when a part is opened elsewhere should ignore the event for the part it
already has open.

Example: a parts list beside the schematic that highlights the part you click.

```html
<kicanvas-embed id="viewer" controls="basic">
    <kicanvas-source src="my-project.kicad_sch"></kicanvas-source>
</kicanvas-embed>

<ul id="parts">
    <li data-ref="R12">R12 - 10k</li>
    <li data-ref="U3">U3 - ATmega328</li>
</ul>

<script type="module">
    const viewer = document.getElementById("viewer");

    document.getElementById("parts").addEventListener("click", async (e) => {
        const ref = e.target.closest("li")?.dataset.ref;
        if (ref && !(await viewer.selectReference(ref))) {
            console.warn(`${ref} is not in the schematic`);
        }
    });
</script>
```
