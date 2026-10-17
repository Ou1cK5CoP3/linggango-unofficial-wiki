#!/usr/bin/env python3
"""Assemble dist/Linggango_Relic_Wiki.html from the build/ parts.

Run build/transform.py first; it writes build/out/data.js.
"""
import pathlib

B = pathlib.Path(__file__).resolve().parent
OUT = B.parent / "dist" / "Linggango_Relic_Wiki.html"


def part(name):
    return (B / name).read_text(encoding="utf-8")


html = "\n".join([
    part("head.html"),
    "<style>",
    part("style.css"),
    part("style.extra.css"),
    part("style.v4.css"),
    "</style>",
    part("body.html"),
    "<script>",
    part("out/data.js"),
    "window.B3=B3;",
    "</script>",
    "<script>",
    part("out/fx3d.js"),
    "</script>",
    "<script>",
    part("app.js"),
    "</script>",
    part("tail.html"),
])
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(OUT, round(len(html.encode()) / 1e6, 2), "MB")
