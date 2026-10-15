/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { SchematicViewer } from "../../../viewers/schematic/viewer";
import type { ProjectPage } from "../../project";
import { KCViewerElement } from "../common/viewer";

export class KCSchematicViewerElement extends KCViewerElement<SchematicViewer> {
    protected override update_theme(): void {
        this.viewer.theme = this.themeObject.schematic;
    }

    protected override make_viewer(): SchematicViewer {
        return new SchematicViewer(
            this.canvas,
            !this.disableinteraction,
            this.themeObject.schematic,
        );
    }

    /**
     * Pass the page, not just its document: a sheet placed more than once
     * shares one document, and the viewer needs the page's sheet path to
     * show that placement's references (R1 vs R101).
     */
    override async load(src: ProjectPage) {
        this.loaded = false;
        await this.viewer.load(src);
    }
}

window.customElements.define("kc-schematic-viewer", KCSchematicViewerElement);
