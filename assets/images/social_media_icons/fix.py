from pathlib import Path
from PIL import Image


max_size = 128
quality = 85


def convert_image(image_path):
    try:
        with Image.open(image_path) as source_image:
            source_image.load()

            has_alpha = "A" in source_image.getbands() or "transparency" in source_image.info
            image_mode = "RGBA" if has_alpha else "RGB"
            image = source_image.convert(image_mode)

            scale = max_size / max(image.width, image.height)
            new_width = max(1, round(image.width * scale))
            new_height = max(1, round(image.height * scale))

            image = image.resize(
                (new_width, new_height),
                Image.Resampling.LANCZOS
            )

            webp_path = image_path.with_suffix(".webp")
            image.save(webp_path, "WEBP", quality=quality, method=6)

        image_path.unlink()
        print(f"Готово: {image_path.name}")
        return True

    except Exception as error:
        print(f"Не удалось обработать {image_path.name}: {error}")
        return False


def main():
    script_folder = Path(__file__).resolve().parent
    converted_count = 0

    for image_path in sorted(script_folder.iterdir()):
        if not image_path.is_file() or image_path.suffix.lower() != ".png":
            continue

        if convert_image(image_path):
            converted_count += 1

    print(f"Обработано изображений: {converted_count}")


if __name__ == "__main__":
    main()