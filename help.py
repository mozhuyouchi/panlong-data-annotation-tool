from pathlib import Path

# 要处理的文件夹（图片目前从 000 开始命名）
folder = Path(r"D:\data\直播课堂-170\0-直播课堂")

# 获取所有 PNG 文件并按数字**倒序**排序（从最大编号开始重命名，避免冲突）
png_files = sorted(folder.glob("*.png"), key=lambda f: int(f.stem), reverse=True)

print(f"找到 {len(png_files)} 张图片，开始**倒序**从 001 重新编号...\n")

for old_file in png_files:
    old_num = int(old_file.stem)
    new_num = old_num + 1                    # 000→001、001→002、...、169→170
    new_name = f"{new_num:03d}.png"
    new_path = folder / new_name
    
    if old_file.name != new_name:
        old_file.rename(new_path)
        print(f"✅ {old_file.name}  →  {new_name}")
    else:
        print(f"   {new_name}（已正确）")

print("\n🎉 重命名完成！现在所有图片从 001.png 开始依次排列（最后一张变成170.png）。")
