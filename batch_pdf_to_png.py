import pymupdf as fitz  # ← 这里改成官方推荐写法，避免所有冲突
from pathlib import Path


def process_pdf(pdf_path: Path):
    """处理单个PDF：切页并保存到以姓名命名的文件夹"""
    # 提取姓名（支持 "0-姓名-xxx页.pdf" 和 "姓名-xxx页.pdf" 两种格式）
    name_part = pdf_path.stem  # 去掉 .pdf
    parts = name_part.split('-')

    if parts[0] == '0' and len(parts) > 1:
        student_name = parts[1]
    else:
        student_name = parts[0]

    # 在PDF所在目录创建以姓名命名的文件夹
    output_dir = pdf_path.parent / student_name
    output_dir.mkdir(parents=True, exist_ok=True)

    # 打开PDF并逐页转为图片
    doc = fitz.open(pdf_path)  # ← 使用 pymupdf 别名
    total_pages = len(doc)

    for i in range(total_pages):
        page = doc.load_page(i)
        # dpi=300 清晰度高，文件大小适中（可根据需要改成 200 或 400）
        pix = page.get_pixmap(dpi=300)
        img_path = output_dir / f"{i + 1:03d}.png"
        pix.save(str(img_path))

    doc.close()
    print(f"✅ 处理完成: {pdf_path.name} → 文件夹 {student_name}（{total_pages} 页）")


if __name__ == "__main__":
    base_dir = Path(r"D:\data")  # ← 你的根目录

    # 递归查找所有PDF文件
    pdf_files = list(base_dir.rglob("*.pdf"))
    print(f"找到 {len(pdf_files)} 个 PDF 文件，开始批量切页...\n")

    for pdf_file in pdf_files:
        try:
            process_pdf(pdf_file)
        except Exception as e:
            print(f"❌ 处理失败 {pdf_file.name}: {e}")

    print("\n🎉 全部处理完成！所有图片已按要求保存在各自的姓名文件夹里。")
