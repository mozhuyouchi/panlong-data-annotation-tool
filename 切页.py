import os
import re
from pathlib import Path

import fitz  # pymupdf


PDF_SUFFIX_RE = re.compile(r"^(?P<book>.+?)\s+-\s*(?P<copy>.+?)\s+\d+面$")


def parse_pdf_name(pdf_path):
    pdf_name = Path(pdf_path).stem
    match = PDF_SUFFIX_RE.match(pdf_name)
    if not match:
        raise ValueError(f"无法从文件名解析书名和副本名：{pdf_name}")
    return match.group("book").strip(), match.group("copy").strip()


def pdf_to_images(pdf_path, output_dir, dpi=200):
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    total = len(doc)
    zoom = dpi / 72
    matrix = fitz.Matrix(zoom, zoom)

    print(f"\nPDF：{pdf_path}")
    print(f"输出目录：{output_dir}")
    print(f"页数：{total}")

    for index, page in enumerate(doc, start=1):
        pixmap = page.get_pixmap(matrix=matrix)
        filename = f"{index:04d}.png"
        output_path = os.path.join(output_dir, filename)
        pixmap.save(output_path)
        print(f"  [{index}/{total}] {filename}")

    doc.close()


def batch_convert(root_dir="data", dpi=200):
    root = Path(root_dir)
    pdf_files = sorted(root.glob("*.pdf"))
    if not pdf_files:
        raise FileNotFoundError(f"在 {root.resolve()} 下没有找到 PDF 文件")

    print(f"共发现 {len(pdf_files)} 个 PDF，开始批量切页...")
    for pdf_file in pdf_files:
        book_name, copy_name = parse_pdf_name(pdf_file)
        output_dir = root / book_name / copy_name
        pdf_to_images(str(pdf_file), str(output_dir), dpi=dpi)

    print("\n全部处理完成。")


if __name__ == "__main__":
    batch_convert(root_dir="data", dpi=200)
